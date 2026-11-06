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

export interface MasterCsvSnapshot {
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
}

export function createEmptySnapshot(): MasterCsvSnapshot {
  return {
    periods: [],
    accounts: [],
    categories: [],
    contributors: [],
    incomeSources: [],
    allocations: [],
    budgetItems: [],
    transactions: [],
    recurringTransactions: [],
    incomeCalculations: []
  };
}

export function totalSnapshotRows(s: MasterCsvSnapshot): number {
  return (
    s.periods.length +
    s.accounts.length +
    s.categories.length +
    s.contributors.length +
    s.incomeSources.length +
    s.allocations.length +
    s.budgetItems.length +
    s.transactions.length +
    s.recurringTransactions.length +
    s.incomeCalculations.length
  );
}

export interface MasterCsvMetadata {
  formatVersion: number;
  appSchemaVersion: number;
  revision: number;
  writtenAtIso: string;
  contentHash: string;
  countsSummary: string;
  syncProtocolVersion: number;
  writtenByDeviceId: string;
  ancestorHashes: string[];
}

export interface DecodedMasterCsv {
  snapshot: MasterCsvSnapshot;
  metadata: MasterCsvMetadata;
  warnings: string[];
}

export interface MasterCsvSummary {
  cyclesCount: number;
  activeCycleName: string | null;
  accountsCount: number;
  envelopesCount: number;
  categoriesCount: number;
  contributorsCount: number;
  incomeSourcesCount: number;
  allocationsCount: number;
  budgetItemsCount: number;
  transactionsCount: number;
  recurringCount: number;
  incomeCalculationsCount: number;
  revision: number;
  writtenAtIso: string;
  contentHash: string;
  warnings: string[];
}

export function summarizeDecodedMasterCsv(decoded: DecodedMasterCsv): MasterCsvSummary {
  const s = decoded.snapshot;
  const active =
    s.periods.find((p) => p.isCurrent)?.name ?? s.periods[0]?.name ?? null;
  const envelopes = s.accounts.filter((a) => a.type === 'ENVELOPE').length;
  const nonEnvelopes = s.accounts.length - envelopes;
  return {
    cyclesCount: s.periods.length,
    activeCycleName: active,
    accountsCount: nonEnvelopes,
    envelopesCount: envelopes,
    categoriesCount: s.categories.length,
    contributorsCount: s.contributors.length,
    incomeSourcesCount: s.incomeSources.length,
    allocationsCount: s.allocations.length,
    budgetItemsCount: s.budgetItems.length,
    transactionsCount: s.transactions.length,
    recurringCount: s.recurringTransactions.length,
    incomeCalculationsCount: s.incomeCalculations.length,
    revision: decoded.metadata.revision,
    writtenAtIso: decoded.metadata.writtenAtIso,
    contentHash: decoded.metadata.contentHash,
    warnings: decoded.warnings
  };
}

export enum SyncTable {
  PERIODS = 'PERIODS',
  ACCOUNTS = 'ACCOUNTS',
  CATEGORIES = 'CATEGORIES',
  CONTRIBUTORS = 'CONTRIBUTORS',
  INCOME_SOURCES = 'INCOME_SOURCES',
  ALLOCATIONS = 'ALLOCATIONS',
  BUDGET_ITEMS = 'BUDGET_ITEMS',
  TRANSACTIONS = 'TRANSACTIONS',
  RECURRING_TRANSACTIONS = 'RECURRING_TRANSACTIONS',
  INCOME_CALCULATIONS = 'INCOME_CALCULATIONS'
}

export const ALL_SYNC_TABLES: SyncTable[] = [
  SyncTable.PERIODS,
  SyncTable.ACCOUNTS,
  SyncTable.CATEGORIES,
  SyncTable.CONTRIBUTORS,
  SyncTable.INCOME_SOURCES,
  SyncTable.ALLOCATIONS,
  SyncTable.BUDGET_ITEMS,
  SyncTable.TRANSACTIONS,
  SyncTable.RECURRING_TRANSACTIONS,
  SyncTable.INCOME_CALCULATIONS
];

export const SYNC_TABLE_META: Record<SyncTable, { key: string; label: string }> = {
  [SyncTable.PERIODS]: { key: 'periods', label: 'Budget cycles' },
  [SyncTable.ACCOUNTS]: { key: 'accounts', label: 'Accounts & envelopes' },
  [SyncTable.CATEGORIES]: { key: 'categories', label: 'Categories' },
  [SyncTable.CONTRIBUTORS]: { key: 'contributors', label: 'Contributors' },
  [SyncTable.INCOME_SOURCES]: { key: 'income_sources', label: 'Income sources' },
  [SyncTable.ALLOCATIONS]: { key: 'allocations', label: 'Contribution allocations' },
  [SyncTable.BUDGET_ITEMS]: { key: 'budget_items', label: 'Budget lines' },
  [SyncTable.TRANSACTIONS]: { key: 'transactions', label: 'Transactions' },
  [SyncTable.RECURRING_TRANSACTIONS]: { key: 'recurring_transactions', label: 'Recurring rules' },
  [SyncTable.INCOME_CALCULATIONS]: { key: 'income_calculations', label: 'Income calculations' }
};

export interface SyncBaseState {
  revision: number;
  contentHash: string;
  writtenAtIso: string;
  updatedAtMillis: number;
  rowsByTable: Record<SyncTable, Record<string, string>>;
  knownAncestorHashes: string[];
}

export const EMPTY_SYNC_BASE_STATE: SyncBaseState = {
  revision: 0,
  contentHash: '',
  writtenAtIso: '',
  updatedAtMillis: 0,
  rowsByTable: {
    [SyncTable.PERIODS]: {},
    [SyncTable.ACCOUNTS]: {},
    [SyncTable.CATEGORIES]: {},
    [SyncTable.CONTRIBUTORS]: {},
    [SyncTable.INCOME_SOURCES]: {},
    [SyncTable.ALLOCATIONS]: {},
    [SyncTable.BUDGET_ITEMS]: {},
    [SyncTable.TRANSACTIONS]: {},
    [SyncTable.RECURRING_TRANSACTIONS]: {},
    [SyncTable.INCOME_CALCULATIONS]: {}
  },
  knownAncestorHashes: []
};

export interface TableChangeCounts {
  table: SyncTable;
  addedLocal: number;
  updatedLocal: number;
  deletedLocal: number;
  addedRemote: number;
  updatedRemote: number;
  deletedRemote: number;
  conflictsResolvedToRemote: number;
  conflictsResolvedToLocal: number;
}

export interface SyncSummary {
  revision: number;
  contentHash: string;
  writtenAtIso: string;
  direction: 'NO_OP' | 'PUSHED' | 'PULLED' | 'MERGED' | 'INITIAL_SEED' | 'RESTORED';
  byTable: TableChangeCounts[];
  duplicateMastersCleaned: number;
  safetySnapshotWritten: string | null;
  warnings: string[];
}

export function totalChangesInSummary(summary: SyncSummary): number {
  let sum = 0;
  for (const t of summary.byTable) {
    sum +=
      t.addedLocal +
      t.updatedLocal +
      t.deletedLocal +
      t.addedRemote +
      t.updatedRemote +
      t.deletedRemote +
      t.conflictsResolvedToRemote +
      t.conflictsResolvedToLocal;
  }
  return sum;
}

export function humanSummaryText(summary: SyncSummary): string {
  switch (summary.direction) {
    case 'NO_OP':
      return `Up to date (rev ${summary.revision})`;
    case 'INITIAL_SEED':
      return `Initial sync complete (rev ${summary.revision})`;
    case 'RESTORED':
      return `Restored from snapshot (rev ${summary.revision})`;
    case 'PUSHED': {
      let pushed = 0;
      for (const t of summary.byTable) {
        pushed += t.addedLocal + t.updatedLocal + t.deletedLocal;
      }
      return `Pushed ${pushed} change(s) · rev ${summary.revision}`;
    }
    case 'PULLED': {
      let pulled = 0;
      for (const t of summary.byTable) {
        pulled += t.addedRemote + t.updatedRemote + t.deletedRemote;
      }
      return `Pulled ${pulled} change(s) · rev ${summary.revision}`;
    }
    case 'MERGED': {
      let pushed = 0;
      let pulled = 0;
      let conflicts = 0;
      for (const t of summary.byTable) {
        pushed += t.addedLocal + t.updatedLocal + t.deletedLocal;
        pulled += t.addedRemote + t.updatedRemote + t.deletedRemote;
        conflicts += t.conflictsResolvedToRemote + t.conflictsResolvedToLocal;
      }
      const conflictSuffix = conflicts > 0 ? `, ${conflicts} conflict(s) resolved` : '';
      return `Merged (${pushed} local, ${pulled} remote${conflictSuffix}) · rev ${summary.revision}`;
    }
  }
}

export type SyncOutcome =
  | { kind: 'Success'; summary: SyncSummary }
  | { kind: 'NotConfigured' }
  | { kind: 'SkippedBusy' }
  | {
      kind: 'MassDeletionBlocked';
      table: SyncTable;
      baseCount: number;
      remainingCount: number;
      deletedCount: number;
    }
  | {
      kind: 'LinkDecisionRequired';
      localSummary: MasterCsvSummary;
      remoteSummary: MasterCsvSummary;
    }
  | {
      kind: 'NeedsAttention';
      reason:
        | 'FOLDER_NOT_ACCESSIBLE'
        | 'AUTH_EXPIRED'
        | 'CORRUPT_REMOTE_FILE'
        | 'UNSUPPORTED_NEWER_VERSION'
        | 'CONCURRENT_MODIFICATION'
        | 'WRITE_VERIFICATION_FAILED'
        | 'IO_ERROR';
      message: string;
      remoteSummary?: MasterCsvSummary | null;
      localSummary?: MasterCsvSummary | null;
    };

export enum SyncIndicatorState {
  NOT_LINKED = 'NOT_LINKED',
  IN_SYNC = 'IN_SYNC',
  SYNCING = 'SYNCING',
  PENDING = 'PENDING',
  NEEDS_ATTENTION = 'NEEDS_ATTENTION'
}

export enum LinkFolderResolution {
  MERGE_BOTH = 'MERGE_BOTH',
  USE_FOLDER_DATA = 'USE_FOLDER_DATA',
  OVERWRITE_FOLDER_WITH_DEVICE = 'OVERWRITE_FOLDER_WITH_DEVICE'
}

export enum ConflictResolutionChoice {
  ACCEPT_REMOTE = 'ACCEPT_REMOTE',
  OVERWRITE_REMOTE_WITH_LOCAL = 'OVERWRITE_REMOTE_WITH_LOCAL',
  MERGE_PREFER_REMOTE = 'MERGE_PREFER_REMOTE',
  MERGE_PREFER_LOCAL = 'MERGE_PREFER_LOCAL'
}

export interface SyncLogEntry {
  timestampMillis: number;
  outcomeKind: string;
  direction: string;
  revision: number;
  contentHash: string;
  message: string;
  duplicateMastersCleaned: number;
  safetySnapshotFileName: string | null;
}
