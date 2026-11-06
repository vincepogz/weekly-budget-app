import {
  ALL_SYNC_TABLES,
  ConflictResolutionChoice,
  DecodedMasterCsv,
  LinkFolderResolution,
  MasterCsvSnapshot,
  MasterCsvSummary,
  SyncBaseState,
  SyncOutcome,
  SyncSummary,
  SyncTable,
  TableChangeCounts,
  summarizeDecodedMasterCsv
} from './syncModels';
import {
  MasterCsvFormat,
  MasterCsvFormatException,
  SyncFingerprints
} from './masterCsvFormat';
import { ConflictPolicy, SnapshotMergeResult, ThreeWayMerge } from './threeWayMerge';
import { DuplicateMasterCandidate, SyncPlanner } from './syncPlanner';
import { SyncFileEntry, SyncFolder } from './syncFolder';
import { GoogleDriveAuthExpiredError } from './googleDriveSync';

export class SyncEngine {
  static readonly MAX_SAFETY_SNAPSHOTS = 50;
  static readonly MAX_TRASH_AGE_MILLIS = 30 * 24 * 60 * 60 * 1000;
  static readonly MAX_CONCURRENT_RETRIES = 2;

  private activeSyncLock = false;

  constructor(
    private readonly readLocalSnapshot: () => Promise<MasterCsvSnapshot>,
    private readonly applyLocalSnapshot: (snapshot: MasterCsvSnapshot) => Promise<void>,
    private readonly readBaseState: () => Promise<SyncBaseState>,
    private readonly writeBaseState: (state: SyncBaseState) => Promise<void>,
    private readonly clearBaseState: () => Promise<void>,
    private readonly deviceIdProvider: () => Promise<string>
  ) {}

  async sync(
    folder: SyncFolder | null,
    options?: {
      conflictPolicy?: ConflictPolicy;
      linkResolution?: LinkFolderResolution | null;
      allowMassDeletion?: boolean;
      writeReports?: boolean;
      isManualSync?: boolean;
    }
  ): Promise<SyncOutcome> {
    if (!folder) {
      return { kind: 'NotConfigured' };
    }
    if (this.activeSyncLock) {
      return { kind: 'SkippedBusy' };
    }
    this.activeSyncLock = true;
    try {
      return await this.runSyncLocked(folder, {
        conflictPolicy: options?.conflictPolicy ?? ConflictPolicy.PREFER_REMOTE,
        linkResolution: options?.linkResolution ?? null,
        allowMassDeletion: options?.allowMassDeletion ?? false,
        writeReports: options?.writeReports ?? false,
        isManualSync: options?.isManualSync ?? true,
        attempt: 0
      });
    } catch (err) {
      if (err instanceof GoogleDriveAuthExpiredError) {
        return {
          kind: 'NeedsAttention',
          reason: 'AUTH_EXPIRED',
          message: err.message
        };
      }
      return {
        kind: 'NeedsAttention',
        reason: 'IO_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected sync error.'
      };
    } finally {
      this.activeSyncLock = false;
    }
  }

  async inspectRemoteMaster(
    folder: SyncFolder
  ): Promise<{ ok: true; decoded: DecodedMasterCsv } | { ok: false; error: Error }> {
    try {
      const accessible = await folder.isAccessible();
      if (!accessible) {
        return {
          ok: false,
          error: new Error('Linked folder is not accessible. Re-select the folder in Settings.')
        };
      }
      const raw = await folder.readText(MasterCsvFormat.FILE_NAME);
      if (!raw || !raw.trim()) {
        return {
          ok: false,
          error: new Error(`No ${MasterCsvFormat.FILE_NAME} found in the selected folder.`)
        };
      }
      const decoded = MasterCsvFormat.decode(raw, false);
      return { ok: true, decoded };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err : new Error(String(err))
      };
    }
  }

  async listSafetySnapshots(folder: SyncFolder): Promise<SyncFileEntry[]> {
    try {
      const trash = await folder.subDirectory(MasterCsvFormat.TRASH_DIR_NAME, false);
      if (!trash) return [];
      const files = await trash.listFiles();
      return files
        .filter((f) => f.name.endsWith('.csv'))
        .sort((a, b) => b.lastModifiedMillis - a.lastModifiedMillis);
    } catch {
      return [];
    }
  }

  async restoreSafetySnapshot(
    folder: SyncFolder,
    snapshotFileName: string
  ): Promise<SyncOutcome> {
    if (this.activeSyncLock) {
      return { kind: 'SkippedBusy' };
    }
    this.activeSyncLock = true;
    try {
      const trash = await folder.subDirectory(MasterCsvFormat.TRASH_DIR_NAME, false);
      if (!trash) {
        return {
          kind: 'NeedsAttention',
          reason: 'IO_ERROR',
          message: 'Safety snapshot directory (.trash) was not found.'
        };
      }
      const raw = await trash.readText(snapshotFileName);
      if (!raw) {
        return {
          kind: 'NeedsAttention',
          reason: 'IO_ERROR',
          message: `Snapshot ${snapshotFileName} could not be read.`
        };
      }
      const decoded = MasterCsvFormat.decode(raw, false);
      const currentRemoteRaw = await folder.readText(MasterCsvFormat.FILE_NAME);
      let currentRemoteRev = decoded.metadata.revision;
      let currentRemoteHash = '';
      if (currentRemoteRaw) {
        try {
          const curMeta = MasterCsvFormat.decode(currentRemoteRaw, false).metadata;
          currentRemoteRev = curMeta.revision;
          currentRemoteHash = curMeta.contentHash;
        } catch {
          // Ignore corrupt current remote when restoring snapshot
        }
      }
      const safetyFile = currentRemoteRaw
        ? await this.writeTrashCopy(folder, currentRemoteRaw)
        : null;
      const baseState = await this.readBaseState();
      const newRevision =
        Math.max(decoded.metadata.revision, currentRemoteRev, baseState.revision) + 1;
      const deviceId = await this.deviceIdProvider();
      const ancestorTrail = [
        ...(currentRemoteHash ? [currentRemoteHash] : []),
        ...decoded.metadata.ancestorHashes
      ]
        .filter((h) => h.length > 0)
        .slice(0, MasterCsvFormat.MAX_ANCESTOR_HASHES);

      const encoded = MasterCsvFormat.encode(decoded.snapshot, {
        revision: newRevision,
        writtenByDeviceId: deviceId,
        ancestorHashes: ancestorTrail
      });

      const wrote = await folder.writeText(MasterCsvFormat.FILE_NAME, encoded.csvText);
      if (!wrote) {
        return {
          kind: 'NeedsAttention',
          reason: 'IO_ERROR',
          message: 'Failed to write restored Master CSV to folder.'
        };
      }

      await this.applyLocalSnapshot(decoded.snapshot);
      await this.recordBaseFromSnapshot(decoded.snapshot, encoded.metadata);

      return {
        kind: 'Success',
        summary: {
          revision: encoded.metadata.revision,
          contentHash: encoded.metadata.contentHash,
          writtenAtIso: encoded.metadata.writtenAtIso,
          direction: 'RESTORED',
          byTable: [],
          duplicateMastersCleaned: 0,
          safetySnapshotWritten: safetyFile,
          warnings: decoded.warnings
        }
      };
    } catch (err) {
      if (err instanceof GoogleDriveAuthExpiredError) {
        return {
          kind: 'NeedsAttention',
          reason: 'AUTH_EXPIRED',
          message: err.message
        };
      }
      return {
        kind: 'NeedsAttention',
        reason: 'CORRUPT_REMOTE_FILE',
        message: `Snapshot could not be parsed: ${
          err instanceof Error ? err.message : String(err)
        }`
      };
    } finally {
      this.activeSyncLock = false;
    }
  }

  async resolveConflict(
    folder: SyncFolder,
    choice: ConflictResolutionChoice
  ): Promise<SyncOutcome> {
    switch (choice) {
      case ConflictResolutionChoice.ACCEPT_REMOTE:
        await this.clearBaseState();
        return this.sync(folder, {
          linkResolution: LinkFolderResolution.USE_FOLDER_DATA,
          allowMassDeletion: true,
          isManualSync: true
        });
      case ConflictResolutionChoice.OVERWRITE_REMOTE_WITH_LOCAL:
        await this.clearBaseState();
        return this.sync(folder, {
          linkResolution: LinkFolderResolution.OVERWRITE_FOLDER_WITH_DEVICE,
          allowMassDeletion: true,
          isManualSync: true
        });
      case ConflictResolutionChoice.MERGE_PREFER_REMOTE:
        return this.sync(folder, {
          conflictPolicy: ConflictPolicy.PREFER_REMOTE,
          linkResolution: LinkFolderResolution.MERGE_BOTH,
          allowMassDeletion: true,
          isManualSync: true
        });
      case ConflictResolutionChoice.MERGE_PREFER_LOCAL:
        return this.sync(folder, {
          conflictPolicy: ConflictPolicy.PREFER_LOCAL,
          linkResolution: LinkFolderResolution.MERGE_BOTH,
          allowMassDeletion: true,
          isManualSync: true
        });
    }
  }

  private async runSyncLocked(
    folder: SyncFolder,
    params: {
      conflictPolicy: ConflictPolicy;
      linkResolution: LinkFolderResolution | null;
      allowMassDeletion: boolean;
      writeReports: boolean;
      isManualSync: boolean;
      attempt: number;
    }
  ): Promise<SyncOutcome> {
    const accessible = await folder.isAccessible();
    if (!accessible) {
      return {
        kind: 'NeedsAttention',
        reason: 'FOLDER_NOT_ACCESSIBLE',
        message: 'Linked sync folder is no longer accessible. Re-select the folder in Settings.'
      };
    }

    const {
      remoteRaw,
      remoteDecoded,
      remoteMasterTrusted,
      forceWriteRemote,
      duplicatesCleaned,
      earlyFailure
    } = await this.resolveAndReadRemoteMaster(folder, params.isManualSync);
    if (earlyFailure) {
      return earlyFailure;
    }

    const baseState = await this.readBaseState();
    const hasBase =
      baseState.revision > 0 &&
      Object.values(baseState.rowsByTable).some((m) => Object.keys(m).length > 0);

    // Item 16: An initialized folder whose master file is now missing is never recreated automatically.
    if (
      hasBase &&
      remoteDecoded === null &&
      !params.isManualSync &&
      params.linkResolution === null
    ) {
      return {
        kind: 'NeedsAttention',
        reason: 'IO_ERROR',
        message:
          "The shared folder's master file is missing. Use Sync Now to recreate it from this device."
      };
    }

    // Stale remote copy check on auto-sync matching SyncEngine.kt:179-185, 196-201
    if (hasBase && remoteDecoded !== null && !params.isManualSync && params.linkResolution === null) {
      const remoteHash = remoteDecoded.metadata.contentHash.trim().toLowerCase();
      const knownLocal = baseState.knownAncestorHashes.map((h) => h.toLowerCase());
      const isOlderCopy =
        (remoteHash.length > 0 &&
          remoteHash !== baseState.contentHash.trim().toLowerCase() &&
          knownLocal.includes(remoteHash)) ||
        (remoteDecoded.metadata.ancestorHashes.length === 0 &&
          remoteDecoded.metadata.revision < baseState.revision);
      if (isOlderCopy) {
        return {
          kind: 'SkippedBusy'
        };
      }
    }

    // Read local snapshot AFTER network read so the planning window is near-zero.
    const localSnapshot = await this.readLocalSnapshot();

    const decision = SyncPlanner.plan({
      baseState,
      localSnapshot,
      remoteDecoded,
      conflictPolicy: params.conflictPolicy,
      linkResolution: params.linkResolution,
      allowMassDeletion: params.allowMassDeletion,
      remoteMasterTrusted,
      forceWriteRemote
    });

    switch (decision.kind) {
      case 'NoOp': {
        if (remoteDecoded !== null && baseState.revision !== remoteDecoded.metadata.revision) {
          await this.recordBaseFromSnapshot(remoteDecoded.snapshot, remoteDecoded.metadata);
        }
        // Item 14: "Sync + Write Reports" writes reports even when already in sync.
        if (params.writeReports) {
          await this.writeReportCsvsBestEffort(folder, localSnapshot);
        }
        return {
          kind: 'Success',
          summary: {
            revision: decision.revision,
            contentHash: decision.contentHash,
            writtenAtIso: decision.writtenAtIso,
            direction: 'NO_OP',
            byTable: [],
            duplicateMastersCleaned: duplicatesCleaned,
            safetySnapshotWritten: null,
            warnings: decision.warnings ?? remoteDecoded?.warnings ?? []
          }
        };
      }

      case 'RequireLinkResolution':
        return {
          kind: 'LinkDecisionRequired',
          localSummary: decision.localSummary,
          remoteSummary: decision.remoteSummary
        };

      case 'MassDeletionConfirmationRequired':
        return {
          kind: 'MassDeletionBlocked',
          table: decision.table,
          baseCount: decision.baseCount,
          remainingCount: decision.remainingCount,
          deletedCount: decision.deletedCount
        };

      case 'AdoptRemoteToLocal': {
        const latestLocal = await this.readLocalSnapshot();
        const adopted = this.preserveLocalCurrentPeriodChoice(
          latestLocal,
          decision.remote.snapshot
        );
        await this.applyLocalSnapshot(adopted);
        await this.recordBaseFromSnapshot(adopted, decision.remote.metadata);
        if (params.writeReports) {
          await this.writeReportCsvsBestEffort(folder, adopted);
        }
        return {
          kind: 'Success',
          summary: {
            revision: decision.remote.metadata.revision,
            contentHash: decision.remote.metadata.contentHash,
            writtenAtIso: decision.remote.metadata.writtenAtIso,
            direction: decision.direction,
            byTable: decision.tableCounts,
            duplicateMastersCleaned: duplicatesCleaned,
            safetySnapshotWritten: null,
            warnings: decision.warnings ?? decision.remote.warnings
          }
        };
      }

      case 'SeedRemoteFromLocal':
        return this.commitWriteToRemote(folder, {
          snapshotToWrite: decision.toWrite,
          mergeResult: null,
          newRevision: decision.revision,
          expectedRemoteContentHash: remoteDecoded?.metadata.contentHash ?? null,
          previousRemoteRaw: remoteRaw,
          previousRemoteDecoded: remoteDecoded,
          baseState,
          updateLocal: false,
          backupMaster: decision.backupMaster ?? false,
          direction: decision.direction,
          tableCounts: decision.tableCounts,
          duplicatesCleaned,
          warnings: remoteDecoded?.warnings ?? [],
          writeReports: params.writeReports,
          conflictPolicy: params.conflictPolicy,
          linkResolution: params.linkResolution,
          allowMassDeletion: params.allowMassDeletion,
          isManualSync: params.isManualSync,
          attempt: params.attempt
        });

      case 'CommitMerge': {
        if (!decision.writeRemote) {
          let finalLocal = decision.merged;
          if (decision.writeLocal) {
            const liveLocal = await this.readLocalSnapshot();
            finalLocal = ThreeWayMerge.applyDifferentialChanges(liveLocal, decision.mergeResult);
            await this.applyLocalSnapshot(finalLocal);
          }
          const meta =
            remoteDecoded?.metadata ??
            MasterCsvFormat.encode(finalLocal, { revision: decision.newRevision }).metadata;
          await this.recordBaseFromSnapshot(decision.merged, meta);
          if (params.writeReports) {
            await this.writeReportCsvsBestEffort(folder, finalLocal);
          }
          return {
            kind: 'Success',
            summary: {
              revision: meta.revision,
              contentHash: meta.contentHash,
              writtenAtIso: meta.writtenAtIso,
              direction: decision.direction,
              byTable: decision.tableCounts,
              duplicateMastersCleaned: duplicatesCleaned,
              safetySnapshotWritten: null,
              warnings: decision.warnings ?? remoteDecoded?.warnings ?? []
            }
          };
        }

        return this.commitWriteToRemote(folder, {
          snapshotToWrite: decision.merged,
          mergeResult: decision.mergeResult,
          newRevision: decision.newRevision,
          expectedRemoteContentHash: remoteDecoded?.metadata.contentHash ?? null,
          previousRemoteRaw: remoteRaw,
          previousRemoteDecoded: remoteDecoded,
          baseState,
          updateLocal: decision.writeLocal,
          backupMaster: decision.backupMaster ?? false,
          direction: decision.direction,
          tableCounts: decision.tableCounts,
          duplicatesCleaned,
          warnings: decision.warnings ?? remoteDecoded?.warnings ?? [],
          writeReports: params.writeReports,
          conflictPolicy: params.conflictPolicy,
          linkResolution: params.linkResolution,
          allowMassDeletion: params.allowMassDeletion,
          isManualSync: params.isManualSync,
          attempt: params.attempt
        });
      }
    }
  }

  private async commitWriteToRemote(
    folder: SyncFolder,
    params: {
      snapshotToWrite: MasterCsvSnapshot;
      mergeResult: SnapshotMergeResult | null;
      newRevision: number;
      expectedRemoteContentHash: string | null;
      previousRemoteRaw: string | null;
      previousRemoteDecoded: DecodedMasterCsv | null;
      baseState: SyncBaseState;
      updateLocal: boolean;
      backupMaster: boolean;
      direction: SyncSummary['direction'];
      tableCounts: TableChangeCounts[];
      duplicatesCleaned: number;
      warnings: string[];
      writeReports: boolean;
      conflictPolicy: ConflictPolicy;
      linkResolution: LinkFolderResolution | null;
      allowMassDeletion: boolean;
      isManualSync: boolean;
      attempt: number;
    }
  ): Promise<SyncOutcome> {
    if (params.expectedRemoteContentHash !== null) {
      const currentRaw = await folder.readText(MasterCsvFormat.FILE_NAME);
      if (currentRaw !== null) {
        const curMeta = MasterCsvFormat.readMeta(currentRaw);
        const currentHash = curMeta?.contentHash ?? '';
        if (currentHash !== params.expectedRemoteContentHash) {
          if (params.attempt < SyncEngine.MAX_CONCURRENT_RETRIES) {
            return this.runSyncLocked(folder, {
              conflictPolicy: params.conflictPolicy,
              linkResolution: params.linkResolution,
              allowMassDeletion: params.allowMassDeletion,
              writeReports: params.writeReports,
              isManualSync: params.isManualSync,
              attempt: params.attempt + 1
            });
          } else {
            return {
              kind: 'NeedsAttention',
              reason: 'CONCURRENT_MODIFICATION',
              message:
                'Another device updated weekly-budget-master.csv while sync was in progress. Tap Sync Now to merge.',
              remoteSummary: params.previousRemoteDecoded
                ? summarizeDecodedMasterCsv(params.previousRemoteDecoded)
                : null
            };
          }
        }
      }
    }

    // Item 15: Only write a .trash/ copy on replace or repair (matching SyncEngine.kt:267, 342-344).
    const safetySnapshotName =
      params.backupMaster && params.previousRemoteRaw && params.previousRemoteRaw.trim()
        ? await this.writeTrashCopy(folder, params.previousRemoteRaw)
        : null;

    const deviceId = await this.deviceIdProvider();
    // Matches SyncEngine.kt:348: (listOf(remoteHash) + remoteAncestors).filter { it.isNotBlank() }.take(MAX_ANCESTORS)
    const remoteHash = params.previousRemoteDecoded?.metadata.contentHash?.trim() ?? '';
    const remoteAncestors = params.previousRemoteDecoded?.metadata.ancestorHashes ?? [];
    const ancestorTrail = [remoteHash, ...remoteAncestors]
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .slice(0, MasterCsvFormat.MAX_ANCESTOR_HASHES);

    const encoded = MasterCsvFormat.encode(params.snapshotToWrite, {
      revision: params.newRevision,
      writtenByDeviceId: deviceId,
      ancestorHashes: ancestorTrail
    });

    const wroteOk = await folder.writeText(MasterCsvFormat.FILE_NAME, encoded.csvText);
    if (!wroteOk) {
      return {
        kind: 'NeedsAttention',
        reason: 'IO_ERROR',
        message: 'Failed to write weekly-budget-master.csv to the sync folder.'
      };
    }

    const verifiedRaw = await folder.readText(MasterCsvFormat.FILE_NAME);
    if (verifiedRaw !== encoded.csvText) {
      let hashOk = false;
      if (verifiedRaw) {
        try {
          const verifiedDecoded = MasterCsvFormat.decode(verifiedRaw, true);
          hashOk =
            verifiedDecoded.metadata.contentHash.toLowerCase() ===
            encoded.metadata.contentHash.toLowerCase();
        } catch {
          hashOk = false;
        }
      }
      if (!hashOk) {
        return {
          kind: 'NeedsAttention',
          reason: 'WRITE_VERIFICATION_FAILED',
          message:
            'Master CSV write verification failed (read-back hash did not match). Local database was kept intact.'
        };
      }
    }

    if (params.backupMaster) {
      await this.pruneTrashBestEffort(folder);
    }

    // Item 6: Apply differential changes on top of the latest live local state so any transaction
    // added while network calls were in flight is preserved!
    const liveLocal = await this.readLocalSnapshot();
    const differentiallyMerged = params.mergeResult
      ? ThreeWayMerge.applyDifferentialChanges(liveLocal, params.mergeResult)
      : liveLocal;
    const syncedTxIds = new Set(params.snapshotToWrite.transactions.map((t) => t.id));
    const finalLocal: MasterCsvSnapshot = {
      ...differentiallyMerged,
      transactions: differentiallyMerged.transactions.map((t) =>
        syncedTxIds.has(t.id) && !t.syncedToMasterSheet
          ? { ...t, syncedToMasterSheet: true }
          : t
      )
    };
    const anyUnsyncedLocal = liveLocal.transactions.some(
      (t) => syncedTxIds.has(t.id) && !t.syncedToMasterSheet
    );
    if (params.updateLocal || anyUnsyncedLocal) {
      await this.applyLocalSnapshot(finalLocal);
    }

    await this.recordBaseFromSnapshot(params.snapshotToWrite, encoded.metadata);

    if (params.writeReports) {
      await this.writeReportCsvsBestEffort(folder, finalLocal);
    }

    return {
      kind: 'Success',
      summary: {
        revision: encoded.metadata.revision,
        contentHash: encoded.metadata.contentHash,
        writtenAtIso: encoded.metadata.writtenAtIso,
        direction: params.direction,
        byTable: params.tableCounts,
        duplicateMastersCleaned: params.duplicatesCleaned,
        safetySnapshotWritten: safetySnapshotName,
        warnings: params.warnings
      }
    };
  }

  private mergeDataUnion(
    higher: MasterCsvSnapshot,
    lower: MasterCsvSnapshot
  ): MasterCsvSnapshot {
    const emptyBase = {} as Record<SyncTable, Record<string, string>>;
    for (const t of ALL_SYNC_TABLES) emptyBase[t] = {};
    return ThreeWayMerge.mergeSnapshots({
      baseByTable: emptyBase,
      local: lower,
      remote: higher,
      conflictPolicy: ConflictPolicy.PREFER_REMOTE,
      isRemoteDeletionTrusted: false
    }).merged;
  }

  private async resolveAndReadRemoteMaster(
    folder: SyncFolder,
    isManualSync: boolean
  ): Promise<{
    remoteRaw: string | null;
    remoteDecoded: DecodedMasterCsv | null;
    remoteMasterTrusted: boolean;
    forceWriteRemote: boolean;
    duplicatesCleaned: number;
    earlyFailure: SyncOutcome | null;
  }> {
    let entries: SyncFileEntry[];
    try {
      entries = await folder.listFiles();
    } catch (err) {
      if (err instanceof GoogleDriveAuthExpiredError) throw err;
      return {
        remoteRaw: null,
        remoteDecoded: null,
        remoteMasterTrusted: false,
        forceWriteRemote: false,
        duplicatesCleaned: 0,
        earlyFailure: {
          kind: 'NeedsAttention',
          reason: 'IO_ERROR',
          message: `Could not list files in sync folder: ${
            err instanceof Error ? err.message : String(err)
          }`
        }
      };
    }

    const candidateEntries = entries.filter((f) =>
      SyncPlanner.isMasterCandidateFileName(f.name)
    );
    if (candidateEntries.length === 0) {
      return {
        remoteRaw: null,
        remoteDecoded: null,
        remoteMasterTrusted: false,
        forceWriteRemote: false,
        duplicatesCleaned: 0,
        earlyFailure: null
      };
    }

    interface ValidCandidate {
      entryKey: string;
      entry: SyncFileEntry;
      raw: string;
      decoded: DecodedMasterCsv;
      intact: boolean;
      isOldFormat: boolean;
    }

    const validCandidates: ValidCandidate[] = [];
    const parseErrors = new Map<string, Error>();

    for (let i = 0; i < candidateEntries.length; i++) {
      const entry = candidateEntries[i];
      const entryKey = entry.id ? `${entry.id}::${entry.name}` : `${i}::${entry.name}`;
      const raw =
        entry.id && typeof folder.readTextById === 'function'
          ? await folder.readTextById(entry.id, entry.name)
          : await folder.readText(entry.name);
      if (!raw || !raw.trim()) continue;
      try {
        const decoded = MasterCsvFormat.decode(raw, false);
        const hasHeader = Boolean(decoded.metadata.contentHash.trim());
        const intact = hasHeader && MasterCsvFormat.isMasterIntact(raw, decoded.metadata);
        const isOldFormat =
          decoded.metadata.syncProtocolVersion === MasterCsvFormat.OLD_MULTI_FILE_PROTOCOL ||
          decoded.metadata.formatVersion < MasterCsvFormat.FORMAT_VERSION;
        validCandidates.push({
          entryKey,
          entry,
          raw,
          decoded,
          intact,
          isOldFormat
        });
      } catch (err) {
        parseErrors.set(entry.name, err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (validCandidates.length === 0) {
      const primaryError =
        parseErrors.get(MasterCsvFormat.FILE_NAME) ??
        Array.from(parseErrors.values())[0];
      if (primaryError instanceof MasterCsvFormatException) {
        switch (primaryError.code) {
          case 'EMPTY_FILE':
            return {
              remoteRaw: null,
              remoteDecoded: null,
              remoteMasterTrusted: false,
              forceWriteRemote: false,
              duplicatesCleaned: 0,
              earlyFailure: null
            };
          case 'UNSUPPORTED_NEWER_VERSION':
            return {
              remoteRaw: null,
              remoteDecoded: null,
              remoteMasterTrusted: false,
              forceWriteRemote: false,
              duplicatesCleaned: 0,
              earlyFailure: {
                kind: 'NeedsAttention',
                reason: 'UNSUPPORTED_NEWER_VERSION',
                message:
                  primaryError.message ||
                  'Master CSV was written by a newer version of Weekly Budget.'
              }
            };
          default: {
            const localSummary = await this.safeLocalSummary();
            return {
              remoteRaw: null,
              remoteDecoded: null,
              remoteMasterTrusted: false,
              forceWriteRemote: false,
              duplicatesCleaned: 0,
              earlyFailure: {
                kind: 'NeedsAttention',
                reason: 'CORRUPT_REMOTE_FILE',
                message: `Master CSV in folder is unreadable (${primaryError.code}): ${primaryError.message}`,
                localSummary
              }
            };
          }
        }
      }
      const localSummary = await this.safeLocalSummary();
      return {
        remoteRaw: null,
        remoteDecoded: null,
        remoteMasterTrusted: false,
        forceWriteRemote: false,
        duplicatesCleaned: 0,
        earlyFailure: {
          kind: 'NeedsAttention',
          reason: 'CORRUPT_REMOTE_FILE',
          message: `Master CSV in folder could not be parsed: ${
            primaryError?.message ?? 'Unknown error'
          }`,
          localSummary
        }
      };
    }

    // Item 9: When 2+ intact copies exist, union-merge all valid copies in ascending revision order
    // matching SyncEngine.kt:404-447!
    const intactCandidates = validCandidates.filter((c) => c.intact);
    if (intactCandidates.length >= 2) {
      const sortedDesc = intactCandidates.slice().sort((a, b) => {
        if (b.decoded.metadata.revision !== a.decoded.metadata.revision) {
          return b.decoded.metadata.revision - a.decoded.metadata.revision;
        }
        const aCanon = a.entry.name.trim().toLowerCase() === MasterCsvFormat.FILE_NAME.toLowerCase();
        const bCanon = b.entry.name.trim().toLowerCase() === MasterCsvFormat.FILE_NAME.toLowerCase();
        if (bCanon !== aCanon) return bCanon ? 1 : -1;
        return b.entry.lastModifiedMillis - a.entry.lastModifiedMillis;
      });
      const canonical = sortedDesc[0];
      const sortedAsc = intactCandidates.slice().sort((a, b) => {
        if (a.decoded.metadata.revision !== b.decoded.metadata.revision) {
          return a.decoded.metadata.revision - b.decoded.metadata.revision;
        }
        return a.entryKey < b.entryKey ? -1 : 1;
      });

      let mergedData = sortedAsc[0].decoded.snapshot;
      for (let i = 1; i < sortedAsc.length; i++) {
        mergedData = this.mergeDataUnion(sortedAsc[i].decoded.snapshot, mergedData);
      }

      let duplicatesCleaned = 0;
      for (const dup of sortedDesc.slice(1)) {
        await this.writeTrashCopy(folder, dup.raw);
        const deleted =
          dup.entry.id && typeof folder.deleteFileById === 'function'
            ? await folder.deleteFileById(dup.entry.id, dup.entry.name)
            : await folder.deleteFile(dup.entry.name);
        if (deleted) duplicatesCleaned++;
      }

      const canonicalIsNamedRight =
        canonical.entry.name.trim().toLowerCase() === MasterCsvFormat.FILE_NAME.toLowerCase();
      if (!canonicalIsNamedRight) {
        const existingCanonicalRaw = await folder.readText(MasterCsvFormat.FILE_NAME);
        if (existingCanonicalRaw) {
          await this.writeTrashCopy(folder, existingCanonicalRaw);
        }
        if (await folder.writeText(MasterCsvFormat.FILE_NAME, canonical.raw)) {
          const deleted =
            canonical.entry.id && typeof folder.deleteFileById === 'function'
              ? await folder.deleteFileById(canonical.entry.id, canonical.entry.name)
              : await folder.deleteFile(canonical.entry.name);
          if (deleted) duplicatesCleaned++;
        }
      }
      await this.pruneTrashBestEffort(folder);

      const warnings = [
        'Two copies of the shared budget were found and merged.',
        ...canonical.decoded.warnings
      ];
      return {
        remoteRaw: canonical.raw,
        remoteDecoded: {
          snapshot: mergedData,
          metadata: canonical.decoded.metadata,
          warnings
        },
        remoteMasterTrusted: false,
        forceWriteRemote: true,
        duplicatesCleaned,
        earlyFailure: null
      };
    }

    const chosen = intactCandidates[0] ?? validCandidates[0];
    // Item 7: If the master has no readable content_hash or fails the body SHA-256 check:
    // On auto-sync, defer/abort without applying anything. On manual sync, repair with masterTrusted = false.
    if (!chosen.intact) {
      if (!isManualSync) {
        const localSummary = await this.safeLocalSummary();
        return {
          remoteRaw: chosen.raw,
          remoteDecoded: null,
          remoteMasterTrusted: false,
          forceWriteRemote: false,
          duplicatesCleaned: 0,
          earlyFailure: {
            kind: 'NeedsAttention',
            reason: 'CORRUPT_REMOTE_FILE',
            message: !chosen.decoded.metadata.contentHash
              ? 'The master file has no readable header.'
              : 'The master file is incomplete (it may still be uploading). Use Sync Now to repair.',
            localSummary
          }
        };
      }
      return {
        remoteRaw: chosen.raw,
        remoteDecoded: chosen.decoded,
        remoteMasterTrusted: false,
        forceWriteRemote: true,
        duplicatesCleaned: 0,
        earlyFailure: null
      };
    }

    const masterTrusted = !chosen.isOldFormat;
    return {
      remoteRaw: chosen.raw,
      remoteDecoded: chosen.decoded,
      remoteMasterTrusted: masterTrusted,
      forceWriteRemote: chosen.isOldFormat,
      duplicatesCleaned: 0,
      earlyFailure: null
    };
  }

  /**
   * Matches SyncFolder.kt:71 trashName(name, now) = "${now}_$name"
   */
  private async writeTrashCopy(
    folder: SyncFolder,
    rawCsv: string,
    baseName: string = MasterCsvFormat.FILE_NAME
  ): Promise<string | null> {
    try {
      const trash = await folder.subDirectory(MasterCsvFormat.TRASH_DIR_NAME, true);
      if (!trash) return null;
      const fileName = `${Date.now()}_${baseName}`;
      const ok = await trash.writeText(fileName, rawCsv);
      return ok ? fileName : null;
    } catch {
      return null;
    }
  }

  /**
   * Matches SyncFolder.kt:59, 134-141 pruneTrash(keep = 50, maxAgeMillis = 30 days)
   */
  private async pruneTrashBestEffort(folder: SyncFolder): Promise<void> {
    try {
      const trash = await folder.subDirectory(MasterCsvFormat.TRASH_DIR_NAME, false);
      if (!trash) return;
      const now = Date.now();
      const entries = (await trash.listFiles()).sort((a, b) =>
        b.name < a.name ? -1 : b.name > a.name ? 1 : 0
      );
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const prefix = entry.name.split('_')[0];
        const parsedStamp = Number.parseInt(prefix, 10);
        const stamp =
          Number.isFinite(parsedStamp) && parsedStamp > 0
            ? parsedStamp
            : entry.lastModifiedMillis;
        if (
          index >= SyncEngine.MAX_SAFETY_SNAPSHOTS ||
          (stamp > 0 && now - stamp > SyncEngine.MAX_TRASH_AGE_MILLIS)
        ) {
          if (entry.id && typeof trash.deleteFileById === 'function') {
            await trash.deleteFileById(entry.id, entry.name);
          } else {
            await trash.deleteFile(entry.name);
          }
        }
      }
    } catch {
      // Ignore trash pruning errors
    }
  }

  private async writeReportCsvsBestEffort(
    folder: SyncFolder,
    snapshot: MasterCsvSnapshot
  ): Promise<void> {
    try {
      const reportsDir = await folder.subDirectory(
        MasterCsvFormat.REPORTS_DIR_NAME,
        true
      );
      if (!reportsDir) return;
      const reports = MasterCsvFormat.generateReportFiles(snapshot);
      for (const [name, content] of Object.entries(reports)) {
        await reportsDir.writeText(name, content);
      }
    } catch {
      // Reports are non-critical
    }
  }

  private async recordBaseFromSnapshot(
    snapshot: MasterCsvSnapshot,
    metadata: DecodedMasterCsv['metadata']
  ): Promise<void> {
    const fingerprints = SyncFingerprints.snapshotFingerprints(snapshot);
    const ancestors = metadata.ancestorHashes
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .slice(0, MasterCsvFormat.MAX_ANCESTOR_HASHES);

    await this.writeBaseState({
      revision: metadata.revision,
      contentHash: metadata.contentHash,
      writtenAtIso: metadata.writtenAtIso,
      updatedAtMillis: Date.now(),
      rowsByTable: fingerprints,
      knownAncestorHashes: ancestors
    });
  }

  private preserveLocalCurrentPeriodChoice(
    local: MasterCsvSnapshot,
    incoming: MasterCsvSnapshot
  ): MasterCsvSnapshot {
    const localCurrentId = local.periods.find((p) => p.isCurrent)?.id;
    let periods = incoming.periods.map((p) => ({
      ...p,
      isCurrent: localCurrentId ? p.id === localCurrentId && !p.isArchived : false
    }));
    if (periods.length > 0 && !periods.some((p) => p.isCurrent)) {
      const activeIdx = periods.findIndex((p) => !p.isArchived);
      const targetIdx = activeIdx >= 0 ? activeIdx : 0;
      periods = periods.map((p, i) => (i === targetIdx ? { ...p, isCurrent: true } : p));
    }
    return {
      ...incoming,
      periods
    };
  }

  private async safeLocalSummary(): Promise<MasterCsvSummary | null> {
    try {
      const local = await this.readLocalSnapshot();
      const encoded = MasterCsvFormat.encode(local, { revision: 1 });
      return summarizeDecodedMasterCsv({
        snapshot: local,
        metadata: encoded.metadata,
        warnings: []
      });
    } catch {
      return null;
    }
  }
}
