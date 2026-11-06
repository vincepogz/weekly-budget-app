import {
  Account,
  AccountReferenceCounts,
  AccountType,
  BudgetFrequency,
  BudgetItem,
  BudgetPeriod,
  BudgetSettings,
  CategoryEntity,
  Cents,
  ContributionAllocation,
  Contributor,
  ContributorIncomeSource,
  DEFAULT_BUDGET_SETTINGS,
  ExpenseType,
  IncomeCalculation,
  RecurringTransaction,
  Transaction
} from '../domain/models';
import { randomUuid } from '../domain/crypto';
import { CyclePlanner } from '../domain/cyclePlanner';
import { normalizeDisplayName } from '../domain/displayName';
import {
  EMPTY_SYNC_BASE_STATE,
  MasterCsvSnapshot,
  SyncBaseState,
  SyncLogEntry,
  createEmptySnapshot
} from '../sync/syncModels';

const IDB_NAME = 'weekly_budget_web_db';
const IDB_VERSION = 1;
const STORE_KV = 'kv_store';

const KEY_SNAPSHOT = 'master_snapshot_v3';
const KEY_SETTINGS = 'budget_settings_v3';
const KEY_SYNC_BASE = 'sync_base_state_v3';
const KEY_SYNC_LOGS = 'sync_logs_v3';
const KEY_FSA_HANDLE = 'fsa_dir_handle_v3';

const LS_FALLBACK_SNAPSHOT = 'wb_snapshot_v3';
const LS_FALLBACK_SETTINGS = 'wb_settings_v3';
const LS_FALLBACK_SYNC_BASE = 'wb_sync_base_v3';
const LS_FALLBACK_SYNC_LOGS = 'wb_sync_logs_v3';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readonly');
      const store = tx.objectStore(STORE_KV);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function lsGet<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsSet<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors
  }
}

export function buildDefaultSeedSnapshot(): MasterCsvSnapshot {
  const plan = CyclePlanner.currentCalendarYear();
  const currentWeek = CyclePlanner.computeCurrentWeek(plan.startDate, plan.weeks);
  const yearLabel = plan.startDate.slice(0, 4);
  const periodId = randomUuid();

  const checkingId = randomUuid();
  const savingsId = randomUuid();
  const emergencyEnvId = randomUuid();
  const carEnvId = randomUuid();
  const cardId = randomUuid();

  const periods: BudgetPeriod[] = [
    {
      id: periodId,
      name: `${yearLabel} Budget`,
      numberOfWeeks: plan.weeks,
      currentWeek,
      startDate: plan.startDate,
      endDate: plan.endDate,
      note: 'Monday-start weekly budget cycle',
      isCurrent: true,
      isArchived: false
    }
  ];

  const accounts: Account[] = [
    {
      id: checkingId,
      name: 'Primary Checking',
      type: AccountType.CHECKING,
      startingBalance: 0,
      targetAmount: 0,
      colorHex: '#2563EB',
      isArchived: false,
      parentAccountId: null
    },
    {
      id: savingsId,
      name: 'High-Yield Savings',
      type: AccountType.SAVINGS,
      startingBalance: 0,
      targetAmount: 0,
      colorHex: '#10B981',
      isArchived: false,
      parentAccountId: null
    },
    {
      id: emergencyEnvId,
      name: 'Emergency Fund',
      type: AccountType.ENVELOPE,
      startingBalance: 0,
      targetAmount: 500_000,
      colorHex: '#0D9488',
      isArchived: false,
      parentAccountId: savingsId
    },
    {
      id: carEnvId,
      name: 'Auto Maintenance',
      type: AccountType.ENVELOPE,
      startingBalance: 0,
      targetAmount: 120_000,
      colorHex: '#F59E0B',
      isArchived: false,
      parentAccountId: checkingId
    },
    {
      id: cardId,
      name: 'Rewards Credit Card',
      type: AccountType.CREDIT_CARD,
      startingBalance: 0,
      targetAmount: 0,
      colorHex: '#7C3AED',
      isArchived: false,
      parentAccountId: null
    }
  ];

  const defaultCategories: Array<[string, string[], string]> = [
    ['Housing', ['Rent / Mortgage', 'Property Tax', 'Home Insurance', 'HOA', 'Maintenance'], '#2563EB'],
    ['Utilities', ['Electric', 'Water & Trash', 'Gas / Heating', 'Internet', 'Mobile Phone'], '#0EA5E9'],
    ['Groceries', ['Supermarket', 'Household Supplies', 'Wholesale Club'], '#10B981'],
    ['Dining Out', ['Restaurants', 'Coffee & Cafes', 'Delivery & Takeout'], '#F59E0B'],
    ['Transportation', ['Fuel / EV Charging', 'Auto Insurance', 'Car Payment', 'Transit & Parking', 'Service & Repairs'], '#F97316'],
    ['Subscriptions', ['Streaming', 'Software & Cloud', 'Memberships'], '#8B5CF6'],
    ['Health & Wellness', ['Medical & Dental', 'Pharmacy', 'Fitness'], '#EC4899'],
    ['Shopping', ['Clothing', 'Electronics', 'Home Goods', 'Gifts'], '#6366F1'],
    ['Entertainment', ['Movies & Events', 'Hobbies', 'Travel & Vacation'], '#14B8A6'],
    ['Savings & Investing', ['Emergency Fund', 'Retirement', 'Brokerage', 'Sinking Fund'], '#059669'],
    ['Debt Payments', ['Credit Card Paydown', 'Student Loan', 'Personal Loan'], '#EF4444']
  ];

  const categories: CategoryEntity[] = defaultCategories.map(([name, subs, color]) => ({
    id: randomUuid(),
    name,
    subCategories: subs,
    colorHex: color
  }));

  const contributors: Contributor[] = [
    {
      id: randomUuid(),
      budgetPeriodId: periodId,
      name: 'You',
      weeklyAllowance: 0,
      note: 'Primary contributor'
    }
  ];

  return {
    periods,
    accounts,
    categories,
    contributors,
    incomeSources: [],
    allocations: [],
    budgetItems: [],
    transactions: [],
    recurringTransactions: [],
    incomeCalculations: []
  };
}

export const PersistentBudgetStorage = {
  async loadSnapshot(): Promise<MasterCsvSnapshot> {
    const fromIdb = await idbGet<MasterCsvSnapshot>(KEY_SNAPSHOT);
    if (fromIdb && fromIdb.periods && fromIdb.periods.length > 0) {
      return fromIdb;
    }
    const fromLs = lsGet<MasterCsvSnapshot>(LS_FALLBACK_SNAPSHOT);
    if (fromLs && fromLs.periods && fromLs.periods.length > 0) {
      await idbSet(KEY_SNAPSHOT, fromLs);
      return fromLs;
    }
    const seeded = buildDefaultSeedSnapshot();
    await PersistentBudgetStorage.saveSnapshot(seeded);
    return seeded;
  },

  async saveSnapshot(snapshot: MasterCsvSnapshot): Promise<void> {
    lsSet(LS_FALLBACK_SNAPSHOT, snapshot);
    await idbSet(KEY_SNAPSHOT, snapshot);
  },

  async loadSettings(): Promise<BudgetSettings> {
    const fromIdb = await idbGet<Partial<BudgetSettings>>(KEY_SETTINGS);
    const fromLs = lsGet<Partial<BudgetSettings>>(LS_FALLBACK_SETTINGS);
    const merged: BudgetSettings = {
      ...DEFAULT_BUDGET_SETTINGS,
      ...(fromLs ?? {}),
      ...(fromIdb ?? {})
    };
    if (!merged.syncDeviceId) {
      merged.syncDeviceId = randomUuid().slice(0, 12);
      await PersistentBudgetStorage.saveSettings(merged);
    }
    return merged;
  },

  async saveSettings(settings: BudgetSettings): Promise<void> {
    lsSet(LS_FALLBACK_SETTINGS, settings);
    await idbSet(KEY_SETTINGS, settings);
  },

  async loadSyncBaseState(): Promise<SyncBaseState> {
    const fromIdb = await idbGet<SyncBaseState>(KEY_SYNC_BASE);
    if (fromIdb && fromIdb.rowsByTable) return fromIdb;
    const fromLs = lsGet<SyncBaseState>(LS_FALLBACK_SYNC_BASE);
    if (fromLs && fromLs.rowsByTable) return fromLs;
    return {
      ...EMPTY_SYNC_BASE_STATE,
      rowsByTable: { ...EMPTY_SYNC_BASE_STATE.rowsByTable },
      knownAncestorHashes: []
    };
  },

  async saveSyncBaseState(state: SyncBaseState): Promise<void> {
    lsSet(LS_FALLBACK_SYNC_BASE, state);
    await idbSet(KEY_SYNC_BASE, state);
  },

  async clearSyncBaseState(): Promise<void> {
    const empty: SyncBaseState = {
      ...EMPTY_SYNC_BASE_STATE,
      rowsByTable: { ...EMPTY_SYNC_BASE_STATE.rowsByTable },
      knownAncestorHashes: []
    };
    lsSet(LS_FALLBACK_SYNC_BASE, empty);
    await idbSet(KEY_SYNC_BASE, empty);
  },

  async loadSyncLogs(): Promise<SyncLogEntry[]> {
    const fromIdb = await idbGet<SyncLogEntry[]>(KEY_SYNC_LOGS);
    if (Array.isArray(fromIdb)) return fromIdb;
    const fromLs = lsGet<SyncLogEntry[]>(LS_FALLBACK_SYNC_LOGS);
    if (Array.isArray(fromLs)) return fromLs;
    return [];
  },

  async appendSyncLog(entry: SyncLogEntry): Promise<SyncLogEntry[]> {
    const current = await PersistentBudgetStorage.loadSyncLogs();
    const updated = [entry, ...current].slice(0, 40);
    lsSet(LS_FALLBACK_SYNC_LOGS, updated);
    await idbSet(KEY_SYNC_LOGS, updated);
    return updated;
  },

  async clearSyncLogs(): Promise<void> {
    lsSet(LS_FALLBACK_SYNC_LOGS, []);
    await idbSet(KEY_SYNC_LOGS, []);
  },

  async saveFsaDirHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
    if (!handle) {
      await idbDelete(KEY_FSA_HANDLE);
    } else {
      await idbSet(KEY_FSA_HANDLE, handle);
    }
  },

  async loadFsaDirHandle(): Promise<FileSystemDirectoryHandle | null> {
    return idbGet<FileSystemDirectoryHandle>(KEY_FSA_HANDLE);
  }
};

/**
 * Pure relational mutation helpers enforcing Room's foreign-key cascades & invariants
 * on an in-memory `MasterCsvSnapshot`.
 */
export const SnapshotMutator = {
  ensureCategoryExists(
    snapshot: MasterCsvSnapshot,
    categoryName: string,
    subCategoryName = '',
    defaultColor = '#4F46E5'
  ): MasterCsvSnapshot {
    const cleanCat = normalizeDisplayName(categoryName);
    if (!cleanCat) return snapshot;
    const cleanSub = normalizeDisplayName(subCategoryName);

    const existing = snapshot.categories.find(
      (c) => c.name.trim().toLowerCase() === cleanCat.toLowerCase()
    );
    if (!existing) {
      const created: CategoryEntity = {
        id: randomUuid(),
        name: cleanCat,
        subCategories: cleanSub ? [cleanSub] : [],
        colorHex: defaultColor
      };
      return {
        ...snapshot,
        categories: [...snapshot.categories, created]
      };
    } else if (
      cleanSub &&
      !existing.subCategories.some((s) => s.trim().toLowerCase() === cleanSub.toLowerCase())
    ) {
      return {
        ...snapshot,
        categories: snapshot.categories.map((c) =>
          c.id === existing.id
            ? { ...c, subCategories: [...c.subCategories, cleanSub] }
            : c
        )
      };
    }
    return snapshot;
  },

  countAccountReferences(
    snapshot: MasterCsvSnapshot,
    accountId: string
  ): AccountReferenceCounts {
    return {
      transactionsFrom: snapshot.transactions.filter((t) => t.accountId === accountId).length,
      transactionsTo: snapshot.transactions.filter((t) => t.toAccountId === accountId).length,
      allocations: snapshot.allocations.filter((a) => a.accountId === accountId).length,
      budgetItems: snapshot.budgetItems.filter((b) => b.targetAccountId === accountId).length,
      recurringRules: snapshot.recurringTransactions.filter(
        (r) => r.accountId === accountId || r.toAccountId === accountId
      ).length,
      childEnvelopes: snapshot.accounts.filter((a) => a.parentAccountId === accountId).length
    };
  },

  deleteAccount(
    snapshot: MasterCsvSnapshot,
    accountId: string,
    reassignToAccountId: string | null = null
  ): MasterCsvSnapshot {
    const replacement =
      reassignToAccountId && reassignToAccountId !== accountId
        ? snapshot.accounts.find((a) => a.id === reassignToAccountId) ?? null
        : null;

    const accounts = snapshot.accounts
      .filter((a) => a.id !== accountId)
      .map((a) =>
        a.parentAccountId === accountId
          ? { ...a, parentAccountId: replacement ? replacement.id : null }
          : a
      );

    const transactions = snapshot.transactions.map((t) => {
      let next = t;
      if (next.accountId === accountId) {
        next = {
          ...next,
          accountId: replacement ? replacement.id : null,
          accountName: replacement ? replacement.name : next.accountName
        };
      }
      if (next.toAccountId === accountId) {
        next = {
          ...next,
          toAccountId: replacement ? replacement.id : null,
          toAccountName: replacement ? replacement.name : next.toAccountName
        };
      }
      return next;
    });

    const allocations = replacement
      ? snapshot.allocations.map((al) =>
          al.accountId === accountId ? { ...al, accountId: replacement.id } : al
        )
      : snapshot.allocations.filter((al) => al.accountId !== accountId);

    const budgetItems = snapshot.budgetItems.map((b) =>
      b.targetAccountId === accountId
        ? { ...b, targetAccountId: replacement ? replacement.id : null }
        : b
    );

    const recurringTransactions = snapshot.recurringTransactions.map((r) => ({
      ...r,
      accountId:
        r.accountId === accountId ? (replacement ? replacement.id : null) : r.accountId,
      toAccountId:
        r.toAccountId === accountId ? (replacement ? replacement.id : null) : r.toAccountId
    }));

    return {
      ...snapshot,
      accounts,
      transactions,
      allocations,
      budgetItems,
      recurringTransactions
    };
  },

  deletePeriod(snapshot: MasterCsvSnapshot, periodId: string): MasterCsvSnapshot {
    const remainingPeriods = snapshot.periods.filter((p) => p.id !== periodId);
    return {
      ...snapshot,
      periods: remainingPeriods,
      contributors: snapshot.contributors.filter((c) => c.budgetPeriodId !== periodId),
      incomeSources: snapshot.incomeSources.filter((s) => s.budgetPeriodId !== periodId),
      allocations: snapshot.allocations.filter((a) => a.budgetPeriodId !== periodId),
      budgetItems: snapshot.budgetItems.filter((b) => b.budgetPeriodId !== periodId),
      transactions: snapshot.transactions.filter((t) => t.budgetPeriodId !== periodId)
    };
  },

  deleteContributor(snapshot: MasterCsvSnapshot, contributorId: string): MasterCsvSnapshot {
    return {
      ...snapshot,
      contributors: snapshot.contributors.filter((c) => c.id !== contributorId),
      incomeSources: snapshot.incomeSources.filter((s) => s.contributorId !== contributorId),
      allocations: snapshot.allocations.filter((a) => a.contributorId !== contributorId),
      transactions: snapshot.transactions.map((t) =>
        t.contributorId === contributorId ? { ...t, contributorId: null } : t
      )
    };
  },

  copyStructureBetweenCycles(params: {
    snapshot: MasterCsvSnapshot;
    fromPeriodId: string;
    toPeriodId: string;
    copyBudgetItems: boolean;
    copyContributors: boolean;
    replaceTargetBudgetItems?: boolean;
  }): MasterCsvSnapshot {
    let next = { ...params.snapshot };

    if (params.copyBudgetItems) {
      if (params.replaceTargetBudgetItems) {
        next.budgetItems = next.budgetItems.filter(
          (b) => b.budgetPeriodId !== params.toPeriodId
        );
      }
      const sourceItems = next.budgetItems.filter(
        (b) => b.budgetPeriodId === params.fromPeriodId
      );
      const existingTarget = next.budgetItems.filter(
        (b) => b.budgetPeriodId === params.toPeriodId
      );
      const existingKeys = new Set(
        existingTarget.map(
          (b) => `${b.category.trim().toLowerCase()}||${b.subCategory.trim().toLowerCase()}`
        )
      );
      const cloned: BudgetItem[] = [];
      for (const item of sourceItems) {
        const key = `${item.category.trim().toLowerCase()}||${item.subCategory.trim().toLowerCase()}`;
        if (!params.replaceTargetBudgetItems && existingKeys.has(key)) continue;
        cloned.push({
          ...item,
          id: randomUuid(),
          budgetPeriodId: params.toPeriodId
        });
      }
      next.budgetItems = [...next.budgetItems, ...cloned];
    }

    if (params.copyContributors) {
      const targetContributors = next.contributors.filter(
        (c) => c.budgetPeriodId === params.toPeriodId
      );
      if (targetContributors.length === 0) {
        const sourceContributors = next.contributors.filter(
          (c) => c.budgetPeriodId === params.fromPeriodId
        );
        const sourceSources = next.incomeSources.filter(
          (s) => s.budgetPeriodId === params.fromPeriodId
        );
        const sourceAllocations = next.allocations.filter(
          (a) => a.budgetPeriodId === params.fromPeriodId
        );

        const newContributors: Contributor[] = [];
        const newSources: ContributorIncomeSource[] = [];
        const newAllocations: ContributionAllocation[] = [];

        for (const c of sourceContributors) {
          const newContributorId = randomUuid();
          newContributors.push({
            ...c,
            id: newContributorId,
            budgetPeriodId: params.toPeriodId
          });
          for (const s of sourceSources.filter((x) => x.contributorId === c.id)) {
            newSources.push({
              ...s,
              id: randomUuid(),
              contributorId: newContributorId,
              budgetPeriodId: params.toPeriodId
            });
          }
          for (const al of sourceAllocations.filter((x) => x.contributorId === c.id)) {
            newAllocations.push({
              ...al,
              id: randomUuid(),
              contributorId: newContributorId,
              budgetPeriodId: params.toPeriodId
            });
          }
        }

        next.contributors = [...next.contributors, ...newContributors];
        next.incomeSources = [...next.incomeSources, ...newSources];
        next.allocations = [...next.allocations, ...newAllocations];
      }
    }

    return next;
  },

  resetPeriodData(snapshot: MasterCsvSnapshot, periodId: string): MasterCsvSnapshot {
    const emptied = {
      ...snapshot,
      contributors: snapshot.contributors.filter((c) => c.budgetPeriodId !== periodId),
      incomeSources: snapshot.incomeSources.filter((s) => s.budgetPeriodId !== periodId),
      allocations: snapshot.allocations.filter((a) => a.budgetPeriodId !== periodId),
      budgetItems: snapshot.budgetItems.filter((b) => b.budgetPeriodId !== periodId),
      transactions: snapshot.transactions.filter((t) => t.budgetPeriodId !== periodId)
    };
    return {
      ...emptied,
      contributors: [
        ...emptied.contributors,
        {
          id: randomUuid(),
          budgetPeriodId: periodId,
          name: 'You',
          weeklyAllowance: 0,
          note: 'Primary contributor'
        }
      ]
    };
  },

  resetAllData(): MasterCsvSnapshot {
    return buildDefaultSeedSnapshot();
  }
};
