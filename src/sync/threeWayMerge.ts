import {
  ALL_SYNC_TABLES,
  MasterCsvSnapshot,
  SyncTable,
  TableChangeCounts
} from './syncModels';
import { MasterCsvFormat, SyncFingerprints } from './masterCsvFormat';
import {
  Account,
  BudgetItem,
  BudgetPeriod,
  CategoryEntity,
  ContributionAllocation,
  Contributor,
  ContributorIncomeSource,
  IncomeCalculation,
  RecurringTransaction,
  Transaction
} from '../domain/models';

export enum ConflictPolicy {
  PREFER_REMOTE = 'PREFER_REMOTE',
  PREFER_LOCAL = 'PREFER_LOCAL'
}

export interface TableMergeResult<T> {
  rows: T[];
  upserts: T[];
  deletes: string[];
  counts: TableChangeCounts;
}

export interface SnapshotMergeResult {
  merged: MasterCsvSnapshot;
  tableCounts: TableChangeCounts[];
  upsertsByTable: {
    periods: BudgetPeriod[];
    accounts: Account[];
    categories: CategoryEntity[];
    contributors: Contributor[];
    incomeSources: ContributorIncomeSource[];
    allocations: ContributionAllocation[];
    budgetItems: BudgetItem[];
    transactions: Transaction[];
    recurringTransactions: RecurringTransaction[];
    incomeCalculations: IncomeCalculation[];
  };
  deletesByTable: Record<SyncTable, string[]>;
  hasLocalChangesVsRemote: boolean;
  hasRemoteChangesVsLocal: boolean;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const ThreeWayMerge = {
  mergeTable<T>(params: {
    table: SyncTable;
    baseFingerprints: Record<string, string>;
    localRows: T[];
    remoteRows: T[];
    idSelector: (row: T) => string;
    fingerprintSelector: (row: T) => string;
    conflictPolicy?: ConflictPolicy;
    isRemoteDeletionTrusted?: boolean;
    rowCombiner?: (local: T | undefined, remote: T, chosen: T) => T;
  }): TableMergeResult<T> {
    const conflictPolicy = params.conflictPolicy ?? ConflictPolicy.PREFER_REMOTE;
    const isRemoteDeletionTrusted = params.isRemoteDeletionTrusted ?? true;
    const rowCombiner =
      params.rowCombiner ?? ((_local: T | undefined, _remote: T, chosen: T) => chosen);

    const localById = new Map<string, T>();
    const localFp = new Map<string, string>();
    for (const row of params.localRows) {
      const id = params.idSelector(row);
      localById.set(id, row);
      localFp.set(id, params.fingerprintSelector(row));
    }

    const remoteById = new Map<string, T>();
    const remoteFp = new Map<string, string>();
    for (const row of params.remoteRows) {
      const id = params.idSelector(row);
      remoteById.set(id, row);
      remoteFp.set(id, params.fingerprintSelector(row));
    }

    const allIdsSet = new Set<string>([
      ...Object.keys(params.baseFingerprints),
      ...localById.keys(),
      ...remoteById.keys()
    ]);
    const allIds = Array.from(allIdsSet).sort(compareCodeUnits);

    const merged: T[] = [];
    const upserts: T[] = [];
    const deletes: string[] = [];
    let addedLocal = 0;
    let updatedLocal = 0;
    let deletedLocal = 0;
    let addedRemote = 0;
    let updatedRemote = 0;
    let deletedRemote = 0;
    let conflictsRemote = 0;
    let conflictsLocal = 0;

    const takeRemote = (lRow: T | undefined, rRow: T) => {
      const combined = rowCombiner(lRow, rRow, rRow);
      merged.push(combined);
      upserts.push(combined);
    };

    for (const id of allIds) {
      const bFp = params.baseFingerprints[id];
      const lRow = localById.get(id);
      const rRow = remoteById.get(id);
      const lFp = localFp.get(id);
      const rFp = remoteFp.get(id);

      if (bFp === undefined) {
        if (lRow !== undefined && rRow === undefined) {
          merged.push(lRow);
          addedLocal++;
        } else if (lRow === undefined && rRow !== undefined) {
          takeRemote(undefined, rRow);
          addedRemote++;
        } else if (lRow !== undefined && rRow !== undefined) {
          if (lFp === rFp) {
            merged.push(lRow);
          } else if (conflictPolicy === ConflictPolicy.PREFER_REMOTE) {
            takeRemote(lRow, rRow);
            conflictsRemote++;
          } else {
            merged.push(rowCombiner(lRow, rRow, lRow));
            conflictsLocal++;
          }
        }
      } else {
        if (lRow !== undefined && rRow !== undefined) {
          const localChanged = lFp !== bFp;
          const remoteChanged = rFp !== bFp;
          if (!localChanged && !remoteChanged) {
            merged.push(lRow);
          } else if (localChanged && !remoteChanged) {
            merged.push(rowCombiner(lRow, rRow, lRow));
            updatedLocal++;
          } else if (!localChanged && remoteChanged) {
            takeRemote(lRow, rRow);
            updatedRemote++;
          } else if (lFp === rFp) {
            merged.push(lRow);
          } else if (conflictPolicy === ConflictPolicy.PREFER_REMOTE) {
            takeRemote(lRow, rRow);
            conflictsRemote++;
          } else {
            merged.push(rowCombiner(lRow, rRow, lRow));
            conflictsLocal++;
          }
        } else if (lRow === undefined && rRow !== undefined) {
          const remoteChanged = rFp !== bFp;
          if (!remoteChanged) {
            deletedLocal++;
          } else {
            takeRemote(undefined, rRow);
            conflictsRemote++;
          }
        } else if (lRow !== undefined && rRow === undefined) {
          if (!isRemoteDeletionTrusted) {
            merged.push(lRow);
          } else {
            const localChanged = lFp !== bFp;
            if (!localChanged) {
              deletes.push(id);
              deletedRemote++;
            } else {
              merged.push(lRow);
              conflictsLocal++;
            }
          }
        }
      }
    }

    return {
      rows: merged,
      upserts,
      deletes,
      counts: {
        table: params.table,
        addedLocal,
        updatedLocal,
        deletedLocal,
        addedRemote,
        updatedRemote,
        deletedRemote,
        conflictsResolvedToRemote: conflictsRemote,
        conflictsResolvedToLocal: conflictsLocal
      }
    };
  },

  mergeSnapshots(params: {
    baseByTable: Record<SyncTable, Record<string, string>>;
    local: MasterCsvSnapshot;
    remote: MasterCsvSnapshot;
    conflictPolicy?: ConflictPolicy;
    isRemoteDeletionTrusted?: boolean;
  }): SnapshotMergeResult {
    const conflictPolicy = params.conflictPolicy ?? ConflictPolicy.PREFER_REMOTE;
    const isRemoteDeletionTrusted = params.isRemoteDeletionTrusted ?? true;
    const baseFor = (t: SyncTable): Record<string, string> => params.baseByTable[t] ?? {};

    const periodsRes = ThreeWayMerge.mergeTable<BudgetPeriod>({
      table: SyncTable.PERIODS,
      baseFingerprints: baseFor(SyncTable.PERIODS),
      localRows: params.local.periods,
      remoteRows: params.remote.periods,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.period,
      conflictPolicy,
      isRemoteDeletionTrusted,
      /** Matches SyncPlanner.kt:86: remote.copy(isCurrent = local?.isCurrent ?: false) */
      rowCombiner: (l, _r, chosen) => ({
        ...chosen,
        isCurrent: l?.isCurrent ?? false
      })
    });

    // If no period is marked current locally after merge (e.g. initial pull), promote one active period.
    let finalPeriods = periodsRes.rows;
    if (finalPeriods.length > 0 && !finalPeriods.some((p) => p.isCurrent)) {
      const activeIdx = finalPeriods.findIndex((p) => !p.isArchived);
      const targetIdx = activeIdx >= 0 ? activeIdx : 0;
      finalPeriods = finalPeriods.map((p, i) => (i === targetIdx ? { ...p, isCurrent: true } : p));
    }

    const accountsRes = ThreeWayMerge.mergeTable<Account>({
      table: SyncTable.ACCOUNTS,
      baseFingerprints: baseFor(SyncTable.ACCOUNTS),
      localRows: params.local.accounts,
      remoteRows: params.remote.accounts,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.account,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const categoriesRes = ThreeWayMerge.mergeTable<CategoryEntity>({
      table: SyncTable.CATEGORIES,
      baseFingerprints: baseFor(SyncTable.CATEGORIES),
      localRows: params.local.categories,
      remoteRows: params.remote.categories,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.category,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const contributorsRes = ThreeWayMerge.mergeTable<Contributor>({
      table: SyncTable.CONTRIBUTORS,
      baseFingerprints: baseFor(SyncTable.CONTRIBUTORS),
      localRows: params.local.contributors,
      remoteRows: params.remote.contributors,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.contributor,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const incomeSourcesRes = ThreeWayMerge.mergeTable<ContributorIncomeSource>({
      table: SyncTable.INCOME_SOURCES,
      baseFingerprints: baseFor(SyncTable.INCOME_SOURCES),
      localRows: params.local.incomeSources,
      remoteRows: params.remote.incomeSources,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.incomeSource,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const allocationsRes = ThreeWayMerge.mergeTable<ContributionAllocation>({
      table: SyncTable.ALLOCATIONS,
      baseFingerprints: baseFor(SyncTable.ALLOCATIONS),
      localRows: params.local.allocations,
      remoteRows: params.remote.allocations,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.allocation,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const budgetItemsRes = ThreeWayMerge.mergeTable<BudgetItem>({
      table: SyncTable.BUDGET_ITEMS,
      baseFingerprints: baseFor(SyncTable.BUDGET_ITEMS),
      localRows: params.local.budgetItems,
      remoteRows: params.remote.budgetItems,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.budgetItem,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const transactionsRes = ThreeWayMerge.mergeTable<Transaction>({
      table: SyncTable.TRANSACTIONS,
      baseFingerprints: baseFor(SyncTable.TRANSACTIONS),
      localRows: params.local.transactions,
      remoteRows: params.remote.transactions,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.transaction,
      conflictPolicy,
      isRemoteDeletionTrusted,
      /** Matches SyncPlanner.kt:110: remote.copy(syncedToMasterSheet = local?.syncedToMasterSheet ?: false) */
      rowCombiner: (l, _r, chosen) => ({
        ...chosen,
        syncedToMasterSheet: l?.syncedToMasterSheet ?? false
      })
    });

    const recurringRes = ThreeWayMerge.mergeTable<RecurringTransaction>({
      table: SyncTable.RECURRING_TRANSACTIONS,
      baseFingerprints: baseFor(SyncTable.RECURRING_TRANSACTIONS),
      localRows: params.local.recurringTransactions,
      remoteRows: params.remote.recurringTransactions,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.recurring,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const incomeCalcRes = ThreeWayMerge.mergeTable<IncomeCalculation>({
      table: SyncTable.INCOME_CALCULATIONS,
      baseFingerprints: baseFor(SyncTable.INCOME_CALCULATIONS),
      localRows: params.local.incomeCalculations,
      remoteRows: params.remote.incomeCalculations,
      idSelector: (x) => x.id,
      fingerprintSelector: SyncFingerprints.incomeCalculation,
      conflictPolicy,
      isRemoteDeletionTrusted
    });

    const rawMerged: MasterCsvSnapshot = {
      periods: finalPeriods,
      accounts: accountsRes.rows,
      categories: categoriesRes.rows,
      contributors: contributorsRes.rows,
      incomeSources: incomeSourcesRes.rows,
      allocations: allocationsRes.rows,
      budgetItems: budgetItemsRes.rows,
      transactions: transactionsRes.rows,
      recurringTransactions: recurringRes.rows,
      incomeCalculations: incomeCalcRes.rows
    };

    const repaired = MasterCsvFormat.validateAndRepair(rawMerged);

    const localFp = SyncFingerprints.snapshotFingerprints(repaired);
    const remoteFp = SyncFingerprints.snapshotFingerprints(params.remote);
    const currentLocalFp = SyncFingerprints.snapshotFingerprints(params.local);

    const mapsEqual = (
      a: Record<SyncTable, Record<string, string>>,
      b: Record<SyncTable, Record<string, string>>
    ): boolean => {
      for (const table of ALL_SYNC_TABLES) {
        const ma = a[table] ?? {};
        const mb = b[table] ?? {};
        const keysA = Object.keys(ma);
        const keysB = Object.keys(mb);
        if (keysA.length !== keysB.length) return false;
        for (const k of keysA) {
          if (ma[k] !== mb[k]) return false;
        }
      }
      return true;
    };

    const hasLocalChangesVsRemote = !mapsEqual(localFp, remoteFp);
    const hasRemoteChangesVsLocal = !mapsEqual(localFp, currentLocalFp);

    return {
      merged: repaired,
      tableCounts: [
        periodsRes.counts,
        accountsRes.counts,
        categoriesRes.counts,
        contributorsRes.counts,
        incomeSourcesRes.counts,
        allocationsRes.counts,
        budgetItemsRes.counts,
        transactionsRes.counts,
        recurringRes.counts,
        incomeCalcRes.counts
      ],
      upsertsByTable: {
        periods: periodsRes.upserts,
        accounts: accountsRes.upserts,
        categories: categoriesRes.upserts,
        contributors: contributorsRes.upserts,
        incomeSources: incomeSourcesRes.upserts,
        allocations: allocationsRes.upserts,
        budgetItems: budgetItemsRes.upserts,
        transactions: transactionsRes.upserts,
        recurringTransactions: recurringRes.upserts,
        incomeCalculations: incomeCalcRes.upserts
      },
      deletesByTable: {
        [SyncTable.PERIODS]: periodsRes.deletes,
        [SyncTable.ACCOUNTS]: accountsRes.deletes,
        [SyncTable.CATEGORIES]: categoriesRes.deletes,
        [SyncTable.CONTRIBUTORS]: contributorsRes.deletes,
        [SyncTable.INCOME_SOURCES]: incomeSourcesRes.deletes,
        [SyncTable.ALLOCATIONS]: allocationsRes.deletes,
        [SyncTable.BUDGET_ITEMS]: budgetItemsRes.deletes,
        [SyncTable.TRANSACTIONS]: transactionsRes.deletes,
        [SyncTable.RECURRING_TRANSACTIONS]: recurringRes.deletes,
        [SyncTable.INCOME_CALCULATIONS]: incomeCalcRes.deletes
      },
      hasLocalChangesVsRemote,
      hasRemoteChangesVsLocal
    };
  },

  /**
   * Applies only remote upserts and remote deletes onto a live local snapshot so any local rows
   * added while network I/O was in flight are preserved (matching Android Repository.applyLocalChanges).
   */
  applyDifferentialChanges(
    liveLocal: MasterCsvSnapshot,
    mergeResult: SnapshotMergeResult
  ): MasterCsvSnapshot {
    const applyTable = <T extends { id: string }>(
      currentRows: T[],
      upserts: T[],
      deletes: string[]
    ): T[] => {
      const deleteSet = new Set(deletes);
      const upsertMap = new Map(upserts.map((u) => [u.id, u]));
      const out: T[] = [];
      const seen = new Set<string>();
      for (const row of currentRows) {
        if (deleteSet.has(row.id)) continue;
        if (upsertMap.has(row.id)) {
          out.push(upsertMap.get(row.id)!);
          seen.add(row.id);
        } else {
          out.push(row);
          seen.add(row.id);
        }
      }
      for (const u of upserts) {
        if (!seen.has(u.id) && !deleteSet.has(u.id)) {
          out.push(u);
        }
      }
      return out;
    };

    let periods = applyTable(
      liveLocal.periods,
      mergeResult.upsertsByTable.periods,
      mergeResult.deletesByTable[SyncTable.PERIODS]
    );
    if (periods.length > 0 && !periods.some((p) => p.isCurrent)) {
      const activeIdx = periods.findIndex((p) => !p.isArchived);
      const targetIdx = activeIdx >= 0 ? activeIdx : 0;
      periods = periods.map((p, i) => (i === targetIdx ? { ...p, isCurrent: true } : p));
    }

    return {
      periods,
      accounts: applyTable(
        liveLocal.accounts,
        mergeResult.upsertsByTable.accounts,
        mergeResult.deletesByTable[SyncTable.ACCOUNTS]
      ),
      categories: applyTable(
        liveLocal.categories,
        mergeResult.upsertsByTable.categories,
        mergeResult.deletesByTable[SyncTable.CATEGORIES]
      ),
      contributors: applyTable(
        liveLocal.contributors,
        mergeResult.upsertsByTable.contributors,
        mergeResult.deletesByTable[SyncTable.CONTRIBUTORS]
      ),
      incomeSources: applyTable(
        liveLocal.incomeSources,
        mergeResult.upsertsByTable.incomeSources,
        mergeResult.deletesByTable[SyncTable.INCOME_SOURCES]
      ),
      allocations: applyTable(
        liveLocal.allocations,
        mergeResult.upsertsByTable.allocations,
        mergeResult.deletesByTable[SyncTable.ALLOCATIONS]
      ),
      budgetItems: applyTable(
        liveLocal.budgetItems,
        mergeResult.upsertsByTable.budgetItems,
        mergeResult.deletesByTable[SyncTable.BUDGET_ITEMS]
      ),
      transactions: applyTable(
        liveLocal.transactions,
        mergeResult.upsertsByTable.transactions,
        mergeResult.deletesByTable[SyncTable.TRANSACTIONS]
      ),
      recurringTransactions: applyTable(
        liveLocal.recurringTransactions,
        mergeResult.upsertsByTable.recurringTransactions,
        mergeResult.deletesByTable[SyncTable.RECURRING_TRANSACTIONS]
      ),
      incomeCalculations: applyTable(
        liveLocal.incomeCalculations,
        mergeResult.upsertsByTable.incomeCalculations,
        mergeResult.deletesByTable[SyncTable.INCOME_CALCULATIONS]
      )
    };
  }
};
