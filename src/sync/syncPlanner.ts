import {
  ALL_SYNC_TABLES,
  DecodedMasterCsv,
  LinkFolderResolution,
  MasterCsvSnapshot,
  SyncBaseState,
  SyncTable,
  TableChangeCounts,
  summarizeDecodedMasterCsv,
  totalSnapshotRows
} from './syncModels';
import { MasterCsvFormat, SyncFingerprints } from './masterCsvFormat';
import { ConflictPolicy, SnapshotMergeResult, ThreeWayMerge } from './threeWayMerge';

export interface DuplicateMasterCandidate {
  name: string;
  revision: number;
  writtenAtIso: string;
  lastModifiedMillis: number;
  isCanonicalName: boolean;
}

export interface DuplicateResolutionResult {
  canonical: DuplicateMasterCandidate | null;
  duplicatesToTrash: DuplicateMasterCandidate[];
}

export type SyncDecision =
  | {
      kind: 'NoOp';
      revision: number;
      contentHash: string;
      writtenAtIso: string;
      warnings?: string[];
    }
  | {
      kind: 'SeedRemoteFromLocal';
      toWrite: MasterCsvSnapshot;
      revision: number;
      direction: 'INITIAL_SEED' | 'PUSHED';
      tableCounts: TableChangeCounts[];
      backupMaster?: boolean;
    }
  | {
      kind: 'AdoptRemoteToLocal';
      remote: DecodedMasterCsv;
      direction: 'INITIAL_SEED' | 'PULLED';
      tableCounts: TableChangeCounts[];
      warnings?: string[];
    }
  | {
      kind: 'CommitMerge';
      merged: MasterCsvSnapshot;
      mergeResult: SnapshotMergeResult;
      newRevision: number;
      writeRemote: boolean;
      writeLocal: boolean;
      direction: 'NO_OP' | 'PUSHED' | 'PULLED' | 'MERGED';
      tableCounts: TableChangeCounts[];
      warnings?: string[];
      backupMaster?: boolean;
    }
  | {
      kind: 'RequireLinkResolution';
      localSummary: ReturnType<typeof summarizeDecodedMasterCsv>;
      remoteSummary: ReturnType<typeof summarizeDecodedMasterCsv>;
    }
  | {
      kind: 'MassDeletionConfirmationRequired';
      table: SyncTable;
      baseCount: number;
      remainingCount: number;
      deletedCount: number;
    };

function emptyCounts(
  builder?: (table: SyncTable, idx: number) => Partial<TableChangeCounts>
): TableChangeCounts[] {
  return ALL_SYNC_TABLES.map((table, idx) => ({
    table,
    addedLocal: 0,
    updatedLocal: 0,
    deletedLocal: 0,
    addedRemote: 0,
    updatedRemote: 0,
    deletedRemote: 0,
    conflictsResolvedToRemote: 0,
    conflictsResolvedToLocal: 0,
    ...(builder ? builder(table, idx) : {})
  }));
}

function mapsEqual(
  a: Record<SyncTable, Record<string, string>>,
  b: Record<SyncTable, Record<string, string>>
): boolean {
  for (const t of ALL_SYNC_TABLES) {
    const ma = a[t] ?? {};
    const mb = b[t] ?? {};
    const ka = Object.keys(ma);
    const kb = Object.keys(mb);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (ma[k] !== mb[k]) return false;
    }
  }
  return true;
}

export const SyncPlanner = {
  DUPLICATE_MASTER_REGEX: /^weekly-budget-master(?:\s*\(\d+\)|\s+conflict.*)?\.csv$/i,
  MASS_DELETE_MIN_BASE_ROWS: 20,
  MASS_DELETE_RATIO_THRESHOLD: 0.5,

  isMasterCandidateFileName(name: string): boolean {
    const trimmed = name.trim();
    if (trimmed.toLowerCase() === MasterCsvFormat.FILE_NAME.toLowerCase()) return true;
    return SyncPlanner.DUPLICATE_MASTER_REGEX.test(trimmed);
  },

  resolveDuplicateCandidates(candidates: DuplicateMasterCandidate[]): DuplicateResolutionResult {
    if (candidates.length === 0) {
      return { canonical: null, duplicatesToTrash: [] };
    }
    if (candidates.length === 1) {
      return { canonical: candidates[0], duplicatesToTrash: [] };
    }
    const sorted = candidates.slice().sort((a, b) => {
      if (b.revision !== a.revision) return b.revision - a.revision;
      if (b.writtenAtIso !== a.writtenAtIso) {
        return b.writtenAtIso < a.writtenAtIso ? -1 : 1;
      }
      if (b.lastModifiedMillis !== a.lastModifiedMillis) {
        return b.lastModifiedMillis - a.lastModifiedMillis;
      }
      if (b.isCanonicalName !== a.isCanonicalName) {
        return b.isCanonicalName ? 1 : -1;
      }
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    return {
      canonical: sorted[0],
      duplicatesToTrash: sorted.slice(1)
    };
  },

  /**
   * True when the snapshot is the untouched default starter seed (buildDefaultSeedSnapshot),
   * so linking a fresh browser to an existing shared folder adopts the folder without prompting.
   */
  isStarterSeedOnly(snapshot: MasterCsvSnapshot): boolean {
    if (snapshot.transactions.length > 0) return false;
    if (snapshot.recurringTransactions.length > 0) return false;
    if (snapshot.incomeCalculations.length > 0) return false;
    if (snapshot.allocations.length > 0) return false;
    if (snapshot.incomeSources.length > 0) return false;
    if (snapshot.budgetItems.some((b) => b.amount > 0)) return false;
    if (snapshot.contributors.some((c) => c.weeklyAllowance > 0)) return false;
    if (snapshot.accounts.some((a) => a.startingBalance !== 0)) return false;
    if (snapshot.periods.length > 1) return false;
    const isDefaultAccounts =
      snapshot.accounts.length === 5 &&
      snapshot.accounts.some((a) => a.name === 'Primary Checking') &&
      snapshot.accounts.some((a) => a.name === 'High-Yield Savings');
    const isDefaultContributor =
      snapshot.contributors.length === 1 &&
      snapshot.contributors[0].name === 'You' &&
      snapshot.contributors[0].note === 'Primary contributor';
    return isDefaultAccounts && isDefaultContributor;
  },

  isMeaningfullyPopulated(snapshot: MasterCsvSnapshot): boolean {
    if (SyncPlanner.isStarterSeedOnly(snapshot)) return false;
    if (snapshot.transactions.length > 0) return true;
    if (snapshot.recurringTransactions.length > 0) return true;
    if (snapshot.incomeCalculations.length > 0) return true;
    if (snapshot.allocations.length > 0) return true;
    if (snapshot.incomeSources.length > 0) return true;
    if (snapshot.contributors.some((c) => c.weeklyAllowance > 0 || c.note.trim().length > 0)) {
      return true;
    }
    if (snapshot.budgetItems.some((b) => b.amount > 0)) return true;
    if (
      snapshot.accounts.some(
        (a) => a.startingBalance !== 0 || a.targetAmount > 0 || a.type === 'ENVELOPE'
      )
    ) {
      return true;
    }
    if (snapshot.periods.length > 1) return true;
    return false;
  },

  /**
   * Matches SyncEngine.kt:237-240 mass-delete check (remote deletions >= 20 and >= 50% of local records),
   * plus per-table remote deletion check so neither new rows nor local deletions skew the count.
   */
  detectMassDeletion(
    baseByTable: Record<SyncTable, Record<string, string>>,
    localSnapshot: MasterCsvSnapshot,
    mergeResult: SnapshotMergeResult
  ): {
    kind: 'MassDeletionConfirmationRequired';
    table: SyncTable;
    baseCount: number;
    remainingCount: number;
    deletedCount: number;
  } | null {
    // 1. Check per-table remote deletions (only counting rows deleted by remote, never local deletions)
    for (const counts of mergeResult.tableCounts) {
      const table = counts.table;
      const baseCount = Object.keys(baseByTable[table] ?? {}).length;
      const remoteDeletedCount = counts.deletedRemote;
      if (
        baseCount >= SyncPlanner.MASS_DELETE_MIN_BASE_ROWS &&
        remoteDeletedCount > 0 &&
        remoteDeletedCount * 2 >= baseCount
      ) {
        return {
          kind: 'MassDeletionConfirmationRequired',
          table,
          baseCount,
          remainingCount: Math.max(0, baseCount - remoteDeletedCount),
          deletedCount: remoteDeletedCount
        };
      }
    }

    // 2. Overall remote deletion check matching SyncEngine.kt:237-240
    let totalRemoteDeletes = 0;
    let dominantTable: SyncTable = SyncTable.TRANSACTIONS;
    let maxTableDeletes = -1;
    for (const counts of mergeResult.tableCounts) {
      totalRemoteDeletes += counts.deletedRemote;
      if (counts.deletedRemote > maxTableDeletes) {
        maxTableDeletes = counts.deletedRemote;
        dominantTable = counts.table;
      }
    }
    const totalLocal = totalSnapshotRows(localSnapshot);
    if (
      totalRemoteDeletes >= SyncPlanner.MASS_DELETE_MIN_BASE_ROWS &&
      totalLocal > 0 &&
      totalRemoteDeletes * 2 >= totalLocal
    ) {
      return {
        kind: 'MassDeletionConfirmationRequired',
        table: dominantTable,
        baseCount: totalLocal,
        remainingCount: Math.max(0, totalLocal - totalRemoteDeletes),
        deletedCount: totalRemoteDeletes
      };
    }

    return null;
  },

  /**
   * Matches SyncEngine.kt:322-323 baseIsOlderThanRecordedHistory.
   */
  baseIsOlderThanRecordedHistory(
    remoteMeta: { revision: number; ancestorHashes: string[] },
    baseState: SyncBaseState
  ): boolean {
    return (
      remoteMeta.ancestorHashes.length >= MasterCsvFormat.MAX_ANCESTOR_HASHES &&
      remoteMeta.revision - baseState.revision > MasterCsvFormat.MAX_ANCESTOR_HASHES
    );
  },

  plan(params: {
    baseState: SyncBaseState;
    localSnapshot: MasterCsvSnapshot;
    remoteDecoded: DecodedMasterCsv | null;
    conflictPolicy?: ConflictPolicy;
    linkResolution?: LinkFolderResolution | null;
    allowMassDeletion?: boolean;
    remoteMasterTrusted?: boolean;
    forceWriteRemote?: boolean;
  }): SyncDecision {
    const conflictPolicy = params.conflictPolicy ?? ConflictPolicy.PREFER_REMOTE;
    const linkResolution = params.linkResolution ?? null;
    const allowMassDeletion = params.allowMassDeletion ?? false;
    const remoteMasterTrusted = params.remoteMasterTrusted ?? true;
    const forceWriteRemote = params.forceWriteRemote ?? false;

    const hasBase =
      params.baseState.revision > 0 &&
      Object.values(params.baseState.rowsByTable).some((m) => Object.keys(m).length > 0);
    const localPopulated = SyncPlanner.isMeaningfullyPopulated(params.localSnapshot);

    if (params.remoteDecoded === null) {
      if (!localPopulated && totalSnapshotRows(params.localSnapshot) === 0) {
        return { kind: 'NoOp', revision: 0, contentHash: '', writtenAtIso: '' };
      }
      const nextRev = Math.max(1, params.baseState.revision + 1);
      return {
        kind: 'SeedRemoteFromLocal',
        toWrite: params.localSnapshot,
        revision: nextRev,
        direction: hasBase ? 'PUSHED' : 'INITIAL_SEED',
        tableCounts: emptyCounts((table) => {
          const count = Object.keys(
            SyncFingerprints.snapshotFingerprints(params.localSnapshot)[table] ?? {}
          ).length;
          return { addedLocal: count };
        })
      };
    }

    const remoteDecoded = params.remoteDecoded;
    const remoteSnapshot = remoteDecoded.snapshot;
    const remoteMeta = remoteDecoded.metadata;
    const remotePopulated =
      SyncPlanner.isMeaningfullyPopulated(remoteSnapshot) ||
      totalSnapshotRows(remoteSnapshot) > 0;

    // Empty-device protection matching SyncEngine.kt:223-227:
    // A lost or cleared local database must never propagate as "delete everything".
    if (
      hasBase &&
      totalSnapshotRows(params.localSnapshot) === 0 &&
      totalSnapshotRows(remoteSnapshot) > 0
    ) {
      const remoteFp = SyncFingerprints.snapshotFingerprints(remoteSnapshot);
      return {
        kind: 'AdoptRemoteToLocal',
        remote: remoteDecoded,
        direction: 'PULLED',
        tableCounts: emptyCounts((table) => ({
          addedRemote: Object.keys(remoteFp[table] ?? {}).length
        })),
        warnings: [
          ...remoteDecoded.warnings,
          "This device's data was empty, so it was restored from the shared folder."
        ]
      };
    }

    const localFp = SyncFingerprints.snapshotFingerprints(params.localSnapshot);
    const remoteFp = SyncFingerprints.snapshotFingerprints(remoteSnapshot);
    if (!forceWriteRemote && remoteMasterTrusted && mapsEqual(localFp, remoteFp)) {
      return {
        kind: 'NoOp',
        revision: remoteMeta.revision,
        contentHash: remoteMeta.contentHash,
        writtenAtIso: remoteMeta.writtenAtIso,
        warnings: remoteDecoded.warnings
      };
    }

    if (!hasBase) {
      if (
        linkResolution === LinkFolderResolution.USE_FOLDER_DATA ||
        (!localPopulated && remotePopulated)
      ) {
        return {
          kind: 'AdoptRemoteToLocal',
          remote: remoteDecoded,
          direction: 'INITIAL_SEED',
          tableCounts: emptyCounts((table) => ({
            addedRemote: Object.keys(remoteFp[table] ?? {}).length
          })),
          warnings: remoteDecoded.warnings
        };
      }
      if (
        linkResolution === LinkFolderResolution.OVERWRITE_FOLDER_WITH_DEVICE ||
        (localPopulated && !remotePopulated)
      ) {
        return {
          kind: 'SeedRemoteFromLocal',
          toWrite: params.localSnapshot,
          revision: Math.max(1, params.baseState.revision, remoteMeta.revision) + 1,
          direction: 'INITIAL_SEED',
          tableCounts: emptyCounts((table) => ({
            addedLocal: Object.keys(localFp[table] ?? {}).length
          })),
          backupMaster: linkResolution === LinkFolderResolution.OVERWRITE_FOLDER_WITH_DEVICE
        };
      }
      if (linkResolution === LinkFolderResolution.MERGE_BOTH) {
        const emptyBase = {} as Record<SyncTable, Record<string, string>>;
        for (const t of ALL_SYNC_TABLES) emptyBase[t] = {};
        const mergeResult = ThreeWayMerge.mergeSnapshots({
          baseByTable: emptyBase,
          local: params.localSnapshot,
          remote: remoteSnapshot,
          conflictPolicy,
          isRemoteDeletionTrusted: false
        });
        const writeRemote = forceWriteRemote || mergeResult.hasLocalChangesVsRemote;
        return {
          kind: 'CommitMerge',
          merged: mergeResult.merged,
          mergeResult,
          newRevision: Math.max(1, params.baseState.revision, remoteMeta.revision) + 1,
          writeRemote,
          writeLocal: mergeResult.hasRemoteChangesVsLocal,
          direction: 'MERGED',
          tableCounts: mergeResult.tableCounts,
          warnings: remoteDecoded.warnings
        };
      }
      if (localPopulated && remotePopulated) {
        const localEnc = MasterCsvFormat.encode(params.localSnapshot, { revision: 1 });
        const localSummary = summarizeDecodedMasterCsv({
          snapshot: params.localSnapshot,
          metadata: localEnc.metadata,
          warnings: []
        });
        const remoteSummary = summarizeDecodedMasterCsv(remoteDecoded);
        return {
          kind: 'RequireLinkResolution',
          localSummary,
          remoteSummary
        };
      }
      return {
        kind: 'AdoptRemoteToLocal',
        remote: remoteDecoded,
        direction: 'INITIAL_SEED',
        tableCounts: emptyCounts((table) => ({
          addedRemote: Object.keys(remoteFp[table] ?? {}).length
        })),
        warnings: remoteDecoded.warnings
      };
    }

    // Lineage & deletion trust check matching SyncEngine.kt:174-204
    let isRemoteDeletionTrusted = remoteMasterTrusted;
    const planWarnings = [...remoteDecoded.warnings];
    const baseHash = params.baseState.contentHash.trim().toLowerCase();
    const remoteHash = remoteMeta.contentHash.trim().toLowerCase();
    const remoteAncestors = remoteMeta.ancestorHashes.map((h) => h.toLowerCase());
    const knownLocalAncestors = params.baseState.knownAncestorHashes.map((h) => h.toLowerCase());

    if (baseHash && remoteHash) {
      if (remoteAncestors.length > 0) {
        if (remoteHash === baseHash || remoteAncestors.includes(baseHash)) {
          // Normal direct descendant
        } else if (knownLocalAncestors.includes(remoteHash)) {
          // Stale remote copy
          isRemoteDeletionTrusted = false;
        } else if (SyncPlanner.baseIsOlderThanRecordedHistory(remoteMeta, params.baseState)) {
          // Base is > 20 revisions behind; still a true ancestor, keep deletion trust
        } else {
          // Diverged branch: keep baseState for edits, disable remote deletions
          isRemoteDeletionTrusted = false;
          planWarnings.push(
            'Changes from another device arrived at the same time. Nothing was deleted on this device; please check recent entries.'
          );
        }
      } else if (remoteMeta.revision < params.baseState.revision) {
        isRemoteDeletionTrusted = false;
      }
    }

    const mergeResult = ThreeWayMerge.mergeSnapshots({
      baseByTable: params.baseState.rowsByTable,
      local: params.localSnapshot,
      remote: remoteSnapshot,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    if (!allowMassDeletion) {
      const massDelete = SyncPlanner.detectMassDeletion(
        params.baseState.rowsByTable,
        params.localSnapshot,
        mergeResult
      );
      if (massDelete !== null) {
        return massDelete;
      }
    }

    const writeRemote =
      forceWriteRemote || !remoteMasterTrusted || mergeResult.hasLocalChangesVsRemote;
    const writeLocal = mergeResult.hasRemoteChangesVsLocal;
    let direction: 'NO_OP' | 'PUSHED' | 'PULLED' | 'MERGED';
    if (!writeRemote && !writeLocal) {
      direction = 'NO_OP';
    } else if (writeRemote && !writeLocal) {
      direction = 'PUSHED';
    } else if (!writeRemote && writeLocal) {
      direction = 'PULLED';
    } else {
      direction = 'MERGED';
    }
    const newRevision = writeRemote
      ? Math.max(params.baseState.revision, remoteMeta.revision) + 1
      : remoteMeta.revision;

    return {
      kind: 'CommitMerge',
      merged: mergeResult.merged,
      mergeResult,
      newRevision,
      writeRemote,
      writeLocal,
      direction,
      tableCounts: mergeResult.tableCounts,
      warnings: planWarnings,
      backupMaster: !remoteMasterTrusted
    };
  }
};
