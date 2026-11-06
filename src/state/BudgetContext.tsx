import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Account,
  AccountReferenceCounts,
  AccountType,
  BudgetFrequency,
  BudgetItem,
  BudgetPeriod,
  BudgetSettings,
  BudgetTotalMode,
  CategoryEntity,
  Cents,
  ContributionAllocation,
  Contributor,
  ContributorIncomeSource,
  DEFAULT_BUDGET_SETTINGS,
  ExpenseType,
  IncomeCalculation,
  PercentageBasis,
  RecurringFrequency,
  RecurringTransaction,
  ThemeMode,
  ThemePalette,
  Transaction,
  TransactionType
} from '../domain/models';
import { randomUuid } from '../domain/crypto';
import { todayIso } from '../domain/localDate';
import { normalizeDisplayName } from '../domain/displayName';
import {
  CyclePickGroups,
  CyclePlanner,
  CycleSelection,
  CycleStatus,
  toCycleSummary
} from '../domain/cyclePlanner';
import { RecurringContribution, RecurringSchedule } from '../domain/recurrence';
import { EnvelopeCoverage } from '../domain/envelopeCoverage';
import {
  ContributorAmounts,
  TransactionSuggestionIndex,
  TransactionSuggestions
} from '../domain/contributorAmounts';
import {
  AccountBalanceDetail,
  BalanceCalculator,
  BudgetCalculator,
  BudgetProgressSummary
} from '../domain/transactionLogic';
import {
  ConflictResolutionChoice,
  DecodedMasterCsv,
  EMPTY_SYNC_BASE_STATE,
  LinkFolderResolution,
  MasterCsvSnapshot,
  MasterCsvSummary,
  SyncBaseState,
  SyncIndicatorState,
  SyncLogEntry,
  SyncOutcome,
  SyncTable,
  createEmptySnapshot,
  humanSummaryText,
  summarizeDecodedMasterCsv
} from '../sync/syncModels';
import { MasterCsvFormat } from '../sync/masterCsvFormat';
import { FsaSyncFolder, SyncFileEntry, SyncFolder } from '../sync/syncFolder';
import {
  GoogleDriveAuth,
  GoogleDriveSyncFolder,
  GoogleTokenSnapshot,
  GoogleUserInfo
} from '../sync/googleDriveSync';
import { SyncEngine } from '../sync/syncEngine';
import {
  PersistentBudgetStorage,
  SnapshotMutator
} from '../storage/budgetStore';
import {
  applyThemeCssVariables,
  resolveEffectiveTheme
} from '../theme/palettes';

export interface LoadFromFolderPreviewState {
  decoded: DecodedMasterCsv;
  remoteSummary: MasterCsvSummary;
  localSummary: MasterCsvSummary;
}

export interface PendingMassDeletionState {
  table: SyncTable;
  baseCount: number;
  remainingCount: number;
  deletedCount: number;
}

export interface PendingLinkDecisionState {
  localSummary: MasterCsvSummary;
  remoteSummary: MasterCsvSummary;
}

export interface BudgetContextValue {
  isHydrated: boolean;
  snapshot: MasterCsvSnapshot;
  settings: BudgetSettings;
  syncBaseState: SyncBaseState;
  syncLogs: SyncLogEntry[];
  safetySnapshots: SyncFileEntry[];

  // Derived cycle state
  selectedPeriod: BudgetPeriod | null;
  selectedCycleStatus: CycleStatus;
  cyclePickGroups: CyclePickGroups;
  computedCurrentWeek: number;
  computedYearProgress: number;
  transactionsEditable: boolean;

  // Derived account & balance state
  activeAccounts: Account[];
  archivedAccounts: Account[];
  accountBalances: AccountBalanceDetail[];
  balanceById: Map<string, AccountBalanceDetail>;

  // Derived contributor & cash-flow state
  periodContributors: Contributor[];
  periodIncomeSources: ContributorIncomeSource[];
  effectiveWeeklyIncomeByContributor: Map<string, Cents>;
  totalWeeklyIncome: Cents;
  periodAllocations: ContributionAllocation[];
  totalAllocatedWeekly: Cents;
  unallocatedWeeklyIncome: Cents;

  // Derived budget & transaction state
  periodBudgetItems: BudgetItem[];
  totalWeeklyBudget: Cents;
  remainingWeeklyAfterBudget: Cents;
  periodTransactions: Transaction[];
  budgetProgress: BudgetProgressSummary;
  coveredByLineInSelectedCycle: Map<string, Cents>;
  transactionSuggestions: TransactionSuggestionIndex;

  // Sticky session date for adding transactions (user reconciliation workflow)
  sessionLastTransactionDate: string;
  setSessionLastTransactionDate: (date: string) => void;

  // Undo snackbar & status messages
  snackbarMessage: string | null;
  clearSnackbar: () => void;
  lastDeletedTransaction: Transaction | null;
  undoDeleteTransaction: () => Promise<void>;

  // Sync UI state
  syncIndicator: SyncIndicatorState;
  isSyncing: boolean;
  syncAttentionOutcome: Extract<SyncOutcome, { kind: 'NeedsAttention' }> | null;
  pendingMassDeletion: PendingMassDeletionState | null;
  pendingLinkDecision: PendingLinkDecisionState | null;
  loadFromFolderPreview: LoadFromFolderPreviewState | null;

  // Google Drive folder chooser modal state
  isDrivePickerOpen: boolean;
  drivePickerUser: GoogleUserInfo | null;
  isClientIdModalOpen: boolean;
  setIsClientIdModalOpen: (open: boolean) => void;
  closeDrivePicker: () => void;
  startGoogleDriveLinkFlow: () => Promise<void>;
  reconnectGoogleDriveSession: () => Promise<void>;
  completeGoogleDriveFolderSelection: (folderId: string, folderName: string) => Promise<void>;
  linkLocalFolderFsa: () => Promise<void>;
  unlinkSyncFolder: () => Promise<void>;

  // Sync operations
  syncMasterCsvNow: (writeReports?: boolean) => Promise<void>;
  resolvePendingLinkDecision: (resolution: LinkFolderResolution) => Promise<void>;
  confirmPendingMassDeletion: () => Promise<void>;
  dismissPendingMassDeletion: () => void;
  resolveSyncConflict: (choice: ConflictResolutionChoice) => Promise<void>;
  previewLoadFromFolder: () => Promise<void>;
  confirmLoadFromFolder: (resolution: LinkFolderResolution) => Promise<void>;
  dismissLoadFromFolderPreview: () => void;
  refreshSafetySnapshots: () => Promise<void>;
  restoreSafetySnapshot: (fileName: string) => Promise<void>;
  importMasterCsvText: (csvText: string, mode: 'replace' | 'merge') => Promise<void>;
  exportMasterCsvDownload: () => void;
  exportReportCsvsDownload: () => void;
  clearSyncLogs: () => Promise<void>;

  // Settings mutations
  updateSettings: (patch: Partial<BudgetSettings>) => Promise<void>;
  setBudgetTotalMode: (mode: BudgetTotalMode) => Promise<void>;
  setPercentageBasis: (basis: PercentageBasis) => Promise<void>;
  setThemePalette: (palette: ThemePalette) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setConfirmExitEnabled: (enabled: boolean) => Promise<void>;

  // Cycle mutations
  selectPeriod: (periodId: string) => Promise<void>;
  createNewPeriod: (params: {
    name: string;
    startDate: string;
    numberOfWeeks: number;
    note?: string;
    makeCurrent: boolean;
    copyFromPeriodId: string | null;
    copyBudgetItems: boolean;
    copyContributors: boolean;
  }) => Promise<void>;
  updatePeriod: (period: BudgetPeriod) => Promise<void>;
  setCurrentPeriod: (periodId: string) => Promise<void>;
  disableCurrentPeriod: (periodId: string) => Promise<void>;
  deletePeriod: (periodId: string) => Promise<void>;
  copyBudgetBetweenCycles: (params: {
    fromPeriodId: string;
    toPeriodId: string;
    replaceExisting: boolean;
  }) => Promise<void>;

  // Account & Envelope mutations
  saveAccount: (account: Omit<Account, 'id'> & { id?: string }) => Promise<Account>;
  deleteAccount: (accountId: string, reassignToAccountId?: string | null) => Promise<void>;
  countAccountReferences: (accountId: string) => AccountReferenceCounts;

  // Category mutations
  saveCategory: (category: Omit<CategoryEntity, 'id'> & { id?: string }) => Promise<void>;
  renameCategory: (categoryId: string, newName: string, subCategories: string[], colorHex: string) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;

  // Contributor & Cash Flow mutations
  saveContributorWithDetails: (params: {
    id?: string;
    name: string;
    weeklyAllowance: Cents;
    note: string;
    incomeSources: Array<{ id?: string; label: string; weeklyAmount: Cents }>;
    allocations: Array<{ id?: string; accountId: string; amount: Cents; percentage: number }>;
  }) => Promise<void>;
  deleteContributor: (contributorId: string) => Promise<void>;
  createOrUpdateRecurringFromAllocation: (params: {
    contributorName: string;
    targetAccount: Account;
    weeklyAmount: Cents;
    frequency: RecurringFrequency;
    startDate: string;
  }) => Promise<void>;
  saveIncomeCalculation: (calc: Omit<IncomeCalculation, 'id'> & { id?: string }) => Promise<void>;
  deleteIncomeCalculation: (id: string) => Promise<void>;

  // Budget Item mutations
  saveBudgetItem: (item: Omit<BudgetItem, 'id'> & { id?: string }) => Promise<void>;
  deleteBudgetItem: (id: string) => Promise<void>;
  recordCoverFromEnvelope: (params: {
    envelopeAccountId: string;
    destinationAccountId: string;
    category: string;
    subCategory: string;
    amount: Cents;
    date: string;
    note: string;
  }) => Promise<void>;
  undoCoverTransfer: (transactionId: string) => Promise<void>;

  // Transaction mutations
  saveTransaction: (
    draft: Omit<Transaction, 'id' | 'budgetPeriodId' | 'accountName' | 'toAccountName' | 'syncedToMasterSheet' | 'createdAt'> & {
      id?: string;
      budgetPeriodId?: string;
      createdAt?: number;
      repeatFrequency?: RecurringFrequency | null;
      isDuplicate?: boolean;
    }
  ) => Promise<void>;
  toggleTransactionCleared: (transactionId: string) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;

  // Recurring Transaction mutations
  saveRecurringRule: (rule: Omit<RecurringTransaction, 'id'> & { id?: string }) => Promise<void>;
  toggleRecurringRuleActive: (ruleId: string) => Promise<void>;
  deleteRecurringRule: (ruleId: string) => Promise<void>;

  // Reset mutations
  resetCurrentCycleData: () => Promise<void>;
  resetAllAppData: () => Promise<void>;
}

interface SyncRunOptions {
  linkResolution?: LinkFolderResolution | null;
  allowMassDeletion?: boolean;
  writeReports?: boolean;
  silentNoOp?: boolean;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export const BudgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHydrated, setIsHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState<MasterCsvSnapshot>(() => createEmptySnapshot());
  const [settings, setSettings] = useState<BudgetSettings>(DEFAULT_BUDGET_SETTINGS);
  const [syncBaseState, setSyncBaseState] = useState<SyncBaseState>(EMPTY_SYNC_BASE_STATE);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [safetySnapshots, setSafetySnapshots] = useState<SyncFileEntry[]>([]);
  const [fsaDirHandle, setFsaDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // Sticky session date for adding transactions (retained across add operations in the session,
  // automatically rolling to today if the browser tab stays open past midnight without a save today)
  const [rawSessionDate, setRawSessionDate] = useState<string>(() => todayIso());
  const [sessionDateRecordedOnDay, setSessionDateRecordedOnDay] = useState<string | null>(null);

  const sessionLastTransactionDate = useMemo(() => {
    const today = todayIso();
    if (sessionDateRecordedOnDay === today && rawSessionDate.trim()) {
      return rawSessionDate.trim();
    }
    return today;
  }, [rawSessionDate, sessionDateRecordedOnDay]);

  const setSessionLastTransactionDate = useCallback((date: string) => {
    if (date && date.trim()) {
      setRawSessionDate(date.trim());
      setSessionDateRecordedOnDay(todayIso());
    }
  }, []);

  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [lastDeletedTransaction, setLastDeletedTransaction] = useState<Transaction | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncAttentionOutcome, setSyncAttentionOutcome] = useState<
    Extract<SyncOutcome, { kind: 'NeedsAttention' }> | null
  >(null);
  const [pendingMassDeletion, setPendingMassDeletion] =
    useState<PendingMassDeletionState | null>(null);
  const [pendingLinkDecision, setPendingLinkDecision] =
    useState<PendingLinkDecisionState | null>(null);
  const [loadFromFolderPreview, setLoadFromFolderPreview] =
    useState<LoadFromFolderPreviewState | null>(null);

  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [drivePickerUser, setDrivePickerUser] = useState<GoogleUserInfo | null>(null);
  const [isClientIdModalOpen, setIsClientIdModalOpen] = useState(false);

  // Preserve previous Google auth token & email until user confirms a folder in the picker
  const prePickerTokenSnapshotRef = useRef<GoogleTokenSnapshot | null>(null);
  const prePickerUserRef = useRef<GoogleUserInfo | null>(null);

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const syncBaseRef = useRef(syncBaseState);
  syncBaseRef.current = syncBaseState;
  const fsaHandleRef = useRef(fsaDirHandle);
  fsaHandleRef.current = fsaDirHandle;

  const isSyncingRef = useRef(false);
  const pendingSyncOptionsRef = useRef<SyncRunOptions | null>(null);
  const autoSyncTimerRef = useRef<number | null>(null);

  const showSnackbar = useCallback((msg: string) => {
    setSnackbarMessage(msg);
  }, []);

  const clearSnackbar = useCallback(() => {
    setSnackbarMessage(null);
  }, []);

  // Theme application
  useEffect(() => {
    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    const apply = () => {
      const prefersDark = media ? media.matches : false;
      const { tokens, isDark } = resolveEffectiveTheme(
        settings.themePalette,
        settings.themeMode,
        prefersDark
      );
      applyThemeCssVariables(tokens, isDark);
    };
    apply();
    if (media && typeof media.addEventListener === 'function') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [settings.themePalette, settings.themeMode]);

  // Confirm before unload when enabled
  useEffect(() => {
    if (!settings.confirmExitEnabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (
        settings.masterSyncFolderUri &&
        settings.lastLocalChangeAtMillis > settings.lastMasterSyncAtMillis
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [
    settings.confirmExitEnabled,
    settings.masterSyncFolderUri,
    settings.lastLocalChangeAtMillis,
    settings.lastMasterSyncAtMillis
  ]);

  const resolveActiveSyncFolder = useCallback((): SyncFolder | null => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.masterSyncFolderUri) return null;
    if (currentSettings.masterSyncType === 'gdrive') {
      const folderId = GoogleDriveSyncFolder.parseFolderId(
        currentSettings.masterSyncFolderUri
      );
      if (!folderId) return null;
      return new GoogleDriveSyncFolder(
        folderId,
        currentSettings.masterSyncFolderLabel || 'Google Drive Folder'
      );
    }
    if (currentSettings.masterSyncType === 'local' && fsaHandleRef.current) {
      return new FsaSyncFolder(fsaHandleRef.current);
    }
    return null;
  }, []);

  const syncEngine = useMemo(
    () =>
      new SyncEngine(
        async () => snapshotRef.current,
        async (nextSnapshot) => {
          snapshotRef.current = nextSnapshot;
          setSnapshot(nextSnapshot);
          await PersistentBudgetStorage.saveSnapshot(nextSnapshot);
        },
        async () => syncBaseRef.current,
        async (nextBase) => {
          syncBaseRef.current = nextBase;
          setSyncBaseState(nextBase);
          await PersistentBudgetStorage.saveSyncBaseState(nextBase);
        },
        async () => {
          syncBaseRef.current = EMPTY_SYNC_BASE_STATE;
          setSyncBaseState(EMPTY_SYNC_BASE_STATE);
          await PersistentBudgetStorage.clearSyncBaseState();
        },
        async () => settingsRef.current.syncDeviceId || 'web-client'
      ),
    []
  );

  // Initial hydration + recurring transaction materialization
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedSnapshot, loadedSettings, loadedBase, loadedLogs, loadedFsa] =
        await Promise.all([
          PersistentBudgetStorage.loadSnapshot(),
          PersistentBudgetStorage.loadSettings(),
          PersistentBudgetStorage.loadSyncBaseState(),
          PersistentBudgetStorage.loadSyncLogs(),
          PersistentBudgetStorage.loadFsaDirHandle()
        ]);
      if (cancelled) return;

      // Materialize due recurring rules into their matching cycle
      const currentPeriod =
        loadedSnapshot.periods.find((p) => p.isCurrent && !p.isArchived) ??
        loadedSnapshot.periods.find((p) => !p.isArchived) ??
        loadedSnapshot.periods[0];

      let finalSnapshot = loadedSnapshot;
      if (currentPeriod && loadedSnapshot.recurringTransactions.length > 0) {
        const accountsMap = new Map(loadedSnapshot.accounts.map((a) => [a.id, a]));
        const mat = RecurringSchedule.materializeDue(
          loadedSnapshot.recurringTransactions,
          currentPeriod.id,
          accountsMap,
          todayIso(),
          Date.now(),
          400,
          loadedSnapshot.periods
        );
        if (mat.newTransactions.length > 0 || mat.updatedRules.length > 0) {
          const existingIds = new Set(loadedSnapshot.transactions.map((t) => t.id));
          const dedupedNew = mat.newTransactions.filter((t) => !existingIds.has(t.id));
          const updatedRuleById = new Map(mat.updatedRules.map((r) => [r.id, r]));
          finalSnapshot = {
            ...loadedSnapshot,
            transactions: [...loadedSnapshot.transactions, ...dedupedNew],
            recurringTransactions: loadedSnapshot.recurringTransactions.map(
              (r) => updatedRuleById.get(r.id) ?? r
            )
          };
          await PersistentBudgetStorage.saveSnapshot(finalSnapshot);
        }
      }

      if (
        !loadedSettings.selectedPeriodId ||
        !finalSnapshot.periods.some((p) => p.id === loadedSettings.selectedPeriodId)
      ) {
        const defaultPeriod =
          finalSnapshot.periods.find((p) => p.isCurrent) ?? finalSnapshot.periods[0];
        if (defaultPeriod) {
          loadedSettings.selectedPeriodId = defaultPeriod.id;
          await PersistentBudgetStorage.saveSettings(loadedSettings);
        }
      }

      snapshotRef.current = finalSnapshot;
      settingsRef.current = loadedSettings;
      syncBaseRef.current = loadedBase;
      fsaHandleRef.current = loadedFsa;

      setSnapshot(finalSnapshot);
      setSettings(loadedSettings);
      setSyncBaseState(loadedBase);
      setSyncLogs(loadedLogs);
      setFsaDirHandle(loadedFsa);
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSyncOutcome = useCallback(
    async (outcome: SyncOutcome, silentNoOp = false) => {
      switch (outcome.kind) {
        case 'Success': {
          const summary = outcome.summary;
          const human = humanSummaryText(summary);
          setSyncAttentionOutcome(null);
          setPendingMassDeletion(null);
          setPendingLinkDecision(null);

          const nextSettings: BudgetSettings = {
            ...settingsRef.current,
            lastSyncedMasterHash: summary.contentHash,
            lastMasterSyncAtMillis: Date.now(),
            lastMasterSyncStatus: `OK: ${human}`
          };
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
          await PersistentBudgetStorage.saveSettings(nextSettings);

          if (summary.direction !== 'NO_OP' || !silentNoOp) {
            const logs = await PersistentBudgetStorage.appendSyncLog({
              timestampMillis: Date.now(),
              outcomeKind: 'Success',
              direction: summary.direction,
              revision: summary.revision,
              contentHash: summary.contentHash.slice(0, 12),
              message: human,
              duplicateMastersCleaned: summary.duplicateMastersCleaned,
              safetySnapshotFileName: summary.safetySnapshotWritten
            });
            setSyncLogs(logs);
          }
          if (!silentNoOp) {
            showSnackbar(human);
          }
          break;
        }
        case 'LinkDecisionRequired': {
          setPendingLinkDecision({
            localSummary: outcome.localSummary,
            remoteSummary: outcome.remoteSummary
          });
          break;
        }
        case 'MassDeletionBlocked': {
          setPendingMassDeletion({
            table: outcome.table,
            baseCount: outcome.baseCount,
            remainingCount: outcome.remainingCount,
            deletedCount: outcome.deletedCount
          });
          break;
        }
        case 'NeedsAttention': {
          setSyncAttentionOutcome(outcome);
          const nextSettings: BudgetSettings = {
            ...settingsRef.current,
            lastMasterSyncStatus: `ERROR (${outcome.reason}): ${outcome.message}`
          };
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
          await PersistentBudgetStorage.saveSettings(nextSettings);

          const logs = await PersistentBudgetStorage.appendSyncLog({
            timestampMillis: Date.now(),
            outcomeKind: `NeedsAttention:${outcome.reason}`,
            direction: 'ERROR',
            revision: syncBaseRef.current.revision,
            contentHash: syncBaseRef.current.contentHash.slice(0, 12),
            message: outcome.message,
            duplicateMastersCleaned: 0,
            safetySnapshotFileName: null
          });
          setSyncLogs(logs);
          if (!silentNoOp) {
            showSnackbar(outcome.message);
          }
          break;
        }
        default:
          break;
      }
    },
    [showSnackbar]
  );

  const runSyncInternal = useCallback(
    async (options?: SyncRunOptions) => {
      const folder = resolveActiveSyncFolder();
      if (!folder) return;
      if (
        settingsRef.current.masterSyncType === 'gdrive' &&
        !GoogleDriveAuth.hasValidToken()
      ) {
        setSyncAttentionOutcome({
          kind: 'NeedsAttention',
          reason: 'AUTH_EXPIRED',
          message:
            'Google Drive session needs to be reconnected for this browser session. Click "Reconnect Google" to resume syncing.'
        });
        return;
      }

      // If a sync is already in flight, queue a follow-up sync once the current one finishes
      if (isSyncingRef.current) {
        const prevPending = pendingSyncOptionsRef.current;
        pendingSyncOptionsRef.current = {
          linkResolution: options?.linkResolution ?? prevPending?.linkResolution ?? null,
          allowMassDeletion: Boolean(
            options?.allowMassDeletion || prevPending?.allowMassDeletion
          ),
          writeReports: Boolean(options?.writeReports || prevPending?.writeReports),
          silentNoOp: Boolean((options?.silentNoOp ?? true) && (prevPending?.silentNoOp ?? true))
        };
        return;
      }

      isSyncingRef.current = true;
      setIsSyncing(true);
      try {
        let currentOptions: SyncRunOptions | null = options ?? { silentNoOp: false };
        while (currentOptions !== null) {
          pendingSyncOptionsRef.current = null;
          const activeFolder = resolveActiveSyncFolder();
          if (!activeFolder) break;
          const outcome = await syncEngine.sync(activeFolder, {
            linkResolution: currentOptions.linkResolution ?? null,
            allowMassDeletion: currentOptions.allowMassDeletion ?? false,
            writeReports: currentOptions.writeReports ?? false
          });
          await handleSyncOutcome(outcome, currentOptions.silentNoOp ?? false);
          currentOptions = pendingSyncOptionsRef.current;
        }
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [resolveActiveSyncFolder, syncEngine, handleSyncOutcome]
  );

  // Trigger sync on hydration and when window regains focus if a sync folder is linked
  useEffect(() => {
    if (!isHydrated) return;
    if (settingsRef.current.masterSyncFolderUri) {
      void runSyncInternal({ silentNoOp: true });
    }
    const onFocus = () => {
      if (
        document.visibilityState === 'visible' &&
        settingsRef.current.masterSyncFolderUri
      ) {
        void runSyncInternal({ silentNoOp: true });
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isHydrated, runSyncInternal]);

  const scheduleAutoSync = useCallback(() => {
    if (!settingsRef.current.masterSyncFolderUri) return;
    if (autoSyncTimerRef.current !== null) {
      window.clearTimeout(autoSyncTimerRef.current);
    }
    autoSyncTimerRef.current = window.setTimeout(() => {
      autoSyncTimerRef.current = null;
      void runSyncInternal({ silentNoOp: true });
    }, 1200);
  }, [runSyncInternal]);

  const commitSnapshotMutation = useCallback(
    async (mutator: (prev: MasterCsvSnapshot) => MasterCsvSnapshot) => {
      const next = mutator(snapshotRef.current);
      snapshotRef.current = next;
      setSnapshot(next);
      await PersistentBudgetStorage.saveSnapshot(next);

      const nextSettings: BudgetSettings = {
        ...settingsRef.current,
        lastLocalChangeAtMillis: Date.now()
      };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      await PersistentBudgetStorage.saveSettings(nextSettings);

      scheduleAutoSync();
    },
    [scheduleAutoSync]
  );

  const updateSettings = useCallback(async (patch: Partial<BudgetSettings>) => {
    const next: BudgetSettings = {
      ...settingsRef.current,
      ...patch
    };
    settingsRef.current = next;
    setSettings(next);
    await PersistentBudgetStorage.saveSettings(next);
  }, []);

  // Derived values
  const selectedPeriod = useMemo(() => {
    const byId = snapshot.periods.find((p) => p.id === settings.selectedPeriodId);
    if (byId) return byId;
    return (
      snapshot.periods.find((p) => p.isCurrent && !p.isArchived) ??
      snapshot.periods[0] ??
      null
    );
  }, [snapshot.periods, settings.selectedPeriodId]);

  const cycleSummaries = useMemo(
    () => snapshot.periods.filter((p) => !p.isArchived).map(toCycleSummary),
    [snapshot.periods]
  );

  const cyclePickGroups = useMemo(
    () => CycleSelection.partitionForPicker(cycleSummaries, todayIso()),
    [cycleSummaries]
  );

  const selectedCycleStatus = useMemo(() => {
    if (!selectedPeriod) return CycleStatus.CURRENT;
    return CycleSelection.classify(toCycleSummary(selectedPeriod), todayIso());
  }, [selectedPeriod]);

  const computedCurrentWeek = useMemo(() => {
    if (!selectedPeriod) return 1;
    return CyclePlanner.computeCurrentWeek(
      selectedPeriod.startDate,
      selectedPeriod.numberOfWeeks,
      todayIso()
    );
  }, [selectedPeriod]);

  const computedYearProgress = useMemo(() => {
    if (!selectedPeriod) return 0;
    return CyclePlanner.yearProgress(
      selectedPeriod.startDate,
      selectedPeriod.numberOfWeeks,
      todayIso()
    );
  }, [selectedPeriod]);

  const transactionsEditable = selectedCycleStatus === CycleStatus.CURRENT;

  const activeAccounts = useMemo(
    () => snapshot.accounts.filter((a) => !a.isArchived),
    [snapshot.accounts]
  );
  const archivedAccounts = useMemo(
    () => snapshot.accounts.filter((a) => a.isArchived),
    [snapshot.accounts]
  );

  const accountBalances = useMemo(
    () => BalanceCalculator.computeAll(snapshot.accounts, snapshot.transactions, true),
    [snapshot.accounts, snapshot.transactions]
  );

  const balanceById = useMemo(() => {
    const map = new Map<string, AccountBalanceDetail>();
    for (const b of accountBalances) {
      map.set(b.account.id, b);
    }
    return map;
  }, [accountBalances]);

  const periodContributors = useMemo(() => {
    if (!selectedPeriod) return [];
    return snapshot.contributors.filter((c) => c.budgetPeriodId === selectedPeriod.id);
  }, [snapshot.contributors, selectedPeriod]);

  const periodIncomeSources = useMemo(() => {
    if (!selectedPeriod) return [];
    return snapshot.incomeSources.filter((s) => s.budgetPeriodId === selectedPeriod.id);
  }, [snapshot.incomeSources, selectedPeriod]);

  const effectiveWeeklyIncomeByContributor = useMemo(() => {
    if (!selectedPeriod) return new Map<string, Cents>();
    return ContributorAmounts.effectiveIncomeForPeriod(
      selectedPeriod.id,
      snapshot.contributors,
      snapshot.incomeSources
    );
  }, [selectedPeriod, snapshot.contributors, snapshot.incomeSources]);

  const totalWeeklyIncome = useMemo(() => {
    let sum = 0;
    for (const val of effectiveWeeklyIncomeByContributor.values()) {
      sum += val;
    }
    return sum;
  }, [effectiveWeeklyIncomeByContributor]);

  const periodAllocations = useMemo(() => {
    if (!selectedPeriod) return [];
    return snapshot.allocations.filter((a) => a.budgetPeriodId === selectedPeriod.id);
  }, [snapshot.allocations, selectedPeriod]);

  const totalAllocatedWeekly = useMemo(
    () => periodAllocations.reduce((acc, a) => acc + a.amount, 0),
    [periodAllocations]
  );

  const unallocatedWeeklyIncome = totalWeeklyIncome - totalAllocatedWeekly;

  const periodBudgetItems = useMemo(() => {
    if (!selectedPeriod) return [];
    return snapshot.budgetItems.filter((b) => b.budgetPeriodId === selectedPeriod.id);
  }, [snapshot.budgetItems, selectedPeriod]);

  const budgetProgress = useMemo(() => {
    if (!selectedPeriod) {
      return {
        totalPlannedWeekly: 0,
        totalPlannedCycle: 0,
        totalActualSpent: 0,
        totalCoveredFromEnvelope: 0,
        totalNetOutOfBudget: 0,
        totalActualIncome: 0,
        netCashFlowActual: 0,
        byCategory: [],
        unplannedCategories: []
      };
    }
    return BudgetCalculator.summarize(
      selectedPeriod.id,
      selectedPeriod.numberOfWeeks,
      snapshot.budgetItems,
      snapshot.transactions
    );
  }, [selectedPeriod, snapshot.budgetItems, snapshot.transactions]);

  const totalWeeklyBudget = budgetProgress.totalPlannedWeekly;
  const remainingWeeklyAfterBudget = totalWeeklyIncome - totalWeeklyBudget;

  const periodTransactions = useMemo(() => {
    if (!selectedPeriod) return [];
    return snapshot.transactions
      .filter((t) => t.budgetPeriodId === selectedPeriod.id)
      .slice()
      .sort((a, b) =>
        b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt
      );
  }, [snapshot.transactions, selectedPeriod]);

  const coveredByLineInSelectedCycle = useMemo(() => {
    if (!selectedPeriod) return new Map<string, Cents>();
    return EnvelopeCoverage.coveredByLineInCycle(selectedPeriod.id, snapshot.transactions);
  }, [selectedPeriod, snapshot.transactions]);

  const transactionSuggestions = useMemo(
    () => TransactionSuggestions.fromHistory(snapshot.transactions, snapshot.categories),
    [snapshot.transactions, snapshot.categories]
  );

  const syncIndicator = useMemo((): SyncIndicatorState => {
    if (!settings.masterSyncFolderUri) return SyncIndicatorState.NOT_LINKED;
    if (isSyncing) return SyncIndicatorState.SYNCING;
    if (
      syncAttentionOutcome !== null ||
      pendingMassDeletion !== null ||
      pendingLinkDecision !== null ||
      (settings.lastMasterSyncStatus ?? '').startsWith('ERROR')
    ) {
      return SyncIndicatorState.NEEDS_ATTENTION;
    }
    if (settings.lastLocalChangeAtMillis > settings.lastMasterSyncAtMillis) {
      return SyncIndicatorState.PENDING;
    }
    return SyncIndicatorState.IN_SYNC;
  }, [
    settings.masterSyncFolderUri,
    settings.lastMasterSyncStatus,
    settings.lastLocalChangeAtMillis,
    settings.lastMasterSyncAtMillis,
    isSyncing,
    syncAttentionOutcome,
    pendingMassDeletion,
    pendingLinkDecision
  ]);

  // Google Drive Link Flow: Link Folder -> Proceed to Google to select account -> Choose Folder
  const startGoogleDriveLinkFlow = useCallback(async () => {
    const clientId = GoogleDriveAuth.getClientId();
    if (!clientId) {
      setIsClientIdModalOpen(true);
      return;
    }
    // Save current token snapshot before opening account chooser so canceling restores previous session
    if (!isDrivePickerOpen) {
      prePickerTokenSnapshotRef.current = GoogleDriveAuth.getTokenSnapshot();
      prePickerUserRef.current = drivePickerUser;
    }
    try {
      const { user } = await GoogleDriveAuth.requestAccessToken({
        selectAccount: true,
        loginHint: settingsRef.current.googleAccountEmail
      });
      setDrivePickerUser(user);
      setIsDrivePickerOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GOOGLE_CLIENT_ID_MISSING') {
        setIsClientIdModalOpen(true);
      } else {
        showSnackbar(msg);
      }
    }
  }, [isDrivePickerOpen, drivePickerUser, showSnackbar]);

  const reconnectGoogleDriveSession = useCallback(async () => {
    const clientId = GoogleDriveAuth.getClientId();
    if (!clientId) {
      setIsClientIdModalOpen(true);
      return;
    }
    try {
      const { user } = await GoogleDriveAuth.requestAccessToken({
        selectAccount: false,
        loginHint: settingsRef.current.googleAccountEmail
      });
      setDrivePickerUser(user);
      await updateSettings({
        googleAccountEmail:
          user.emailAddress || settingsRef.current.googleAccountEmail
      });
      setSyncAttentionOutcome(null);
      await runSyncInternal({ silentNoOp: false });
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Failed to reconnect Google Drive.');
    }
  }, [updateSettings, runSyncInternal, showSnackbar]);

  const completeGoogleDriveFolderSelection = useCallback(
    async (folderId: string, folderName: string) => {
      setIsDrivePickerOpen(false);
      prePickerTokenSnapshotRef.current = null;
      prePickerUserRef.current = null;

      await PersistentBudgetStorage.clearSyncBaseState();
      syncBaseRef.current = EMPTY_SYNC_BASE_STATE;
      setSyncBaseState(EMPTY_SYNC_BASE_STATE);

      await updateSettings({
        googleAccountEmail:
          drivePickerUser?.emailAddress ||
          drivePickerUser?.displayName ||
          settingsRef.current.googleAccountEmail,
        masterSyncFolderUri: `gdrive://${folderId}`,
        masterSyncFolderLabel: folderName,
        masterSyncType: 'gdrive',
        lastMasterSyncStatus: `Linked to Google Drive folder "${folderName}"`
      });

      await runSyncInternal({ silentNoOp: false });
    },
    [drivePickerUser, updateSettings, runSyncInternal]
  );

  const closeDrivePicker = useCallback(() => {
    setIsDrivePickerOpen(false);
    // If the user canceled without selecting a folder, restore the previous token snapshot
    if (prePickerTokenSnapshotRef.current) {
      GoogleDriveAuth.restoreTokenSnapshot(prePickerTokenSnapshotRef.current);
      setDrivePickerUser(prePickerUserRef.current);
      prePickerTokenSnapshotRef.current = null;
      prePickerUserRef.current = null;
    }
  }, []);

  const linkLocalFolderFsa = useCallback(async () => {
    const win = window as unknown as {
      showDirectoryPicker?: (opts: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
    };
    if (typeof win.showDirectoryPicker !== 'function') {
      showSnackbar(
        'Direct local folder linking requires a Chromium browser (Chrome, Edge, Brave). Use Google Drive Sync or Import/Export CSV instead.'
      );
      return;
    }
    try {
      const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
      await PersistentBudgetStorage.saveFsaDirHandle(handle);
      fsaHandleRef.current = handle;
      setFsaDirHandle(handle);

      await PersistentBudgetStorage.clearSyncBaseState();
      syncBaseRef.current = EMPTY_SYNC_BASE_STATE;
      setSyncBaseState(EMPTY_SYNC_BASE_STATE);

      await updateSettings({
        masterSyncFolderUri: `fsa://${handle.name}`,
        masterSyncFolderLabel: `${handle.name} (Local)`,
        masterSyncType: 'local',
        lastMasterSyncStatus: `Linked to local folder "${handle.name}"`
      });
      await runSyncInternal({ silentNoOp: false });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      showSnackbar(err instanceof Error ? err.message : 'Could not link local folder.');
    }
  }, [updateSettings, runSyncInternal, showSnackbar]);

  const unlinkSyncFolder = useCallback(async () => {
    GoogleDriveAuth.clearToken();
    await PersistentBudgetStorage.saveFsaDirHandle(null);
    fsaHandleRef.current = null;
    setFsaDirHandle(null);

    await PersistentBudgetStorage.clearSyncBaseState();
    syncBaseRef.current = EMPTY_SYNC_BASE_STATE;
    setSyncBaseState(EMPTY_SYNC_BASE_STATE);
    setSyncAttentionOutcome(null);
    setPendingLinkDecision(null);
    setPendingMassDeletion(null);

    await updateSettings({
      masterSyncFolderUri: null,
      masterSyncFolderLabel: null,
      masterSyncType: 'none',
      lastSyncedMasterHash: null,
      lastMasterSyncStatus: 'Unlinked'
    });
    showSnackbar('Sync folder unlinked. Local data was kept intact.');
  }, [updateSettings, showSnackbar]);

  const syncMasterCsvNow = useCallback(
    async (writeReports = false) => {
      await runSyncInternal({ writeReports, silentNoOp: false });
    },
    [runSyncInternal]
  );

  const resolvePendingLinkDecision = useCallback(
    async (resolution: LinkFolderResolution) => {
      setPendingLinkDecision(null);
      await runSyncInternal({ linkResolution: resolution, allowMassDeletion: true });
    },
    [runSyncInternal]
  );

  const confirmPendingMassDeletion = useCallback(async () => {
    setPendingMassDeletion(null);
    await runSyncInternal({ allowMassDeletion: true });
  }, [runSyncInternal]);

  const dismissPendingMassDeletion = useCallback(() => {
    setPendingMassDeletion(null);
  }, []);

  const resolveSyncConflict = useCallback(
    async (choice: ConflictResolutionChoice) => {
      const folder = resolveActiveSyncFolder();
      if (!folder) return;
      setIsSyncing(true);
      try {
        const outcome = await syncEngine.resolveConflict(folder, choice);
        await handleSyncOutcome(outcome, false);
      } finally {
        setIsSyncing(false);
      }
    },
    [resolveActiveSyncFolder, syncEngine, handleSyncOutcome]
  );

  const previewLoadFromFolder = useCallback(async () => {
    const folder = resolveActiveSyncFolder();
    if (!folder) {
      showSnackbar('Link a folder first before loading from folder.');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await syncEngine.inspectRemoteMaster(folder);
      if (!res.ok) {
        showSnackbar(res.error.message);
        return;
      }
      const localEnc = MasterCsvFormat.encode(snapshotRef.current, { revision: 1 });
      const localSummary = summarizeDecodedMasterCsv({
        snapshot: snapshotRef.current,
        metadata: localEnc.metadata,
        warnings: []
      });
      const remoteSummary = summarizeDecodedMasterCsv(res.decoded);
      setLoadFromFolderPreview({
        decoded: res.decoded,
        remoteSummary,
        localSummary
      });
    } finally {
      setIsSyncing(false);
    }
  }, [resolveActiveSyncFolder, syncEngine, showSnackbar]);

  const confirmLoadFromFolder = useCallback(
    async (resolution: LinkFolderResolution) => {
      setLoadFromFolderPreview(null);
      await PersistentBudgetStorage.clearSyncBaseState();
      syncBaseRef.current = EMPTY_SYNC_BASE_STATE;
      setSyncBaseState(EMPTY_SYNC_BASE_STATE);
      await runSyncInternal({ linkResolution: resolution, allowMassDeletion: true });
    },
    [runSyncInternal]
  );

  const dismissLoadFromFolderPreview = useCallback(() => {
    setLoadFromFolderPreview(null);
  }, []);

  const refreshSafetySnapshots = useCallback(async () => {
    const folder = resolveActiveSyncFolder();
    if (!folder) {
      setSafetySnapshots([]);
      return;
    }
    const list = await syncEngine.listSafetySnapshots(folder);
    setSafetySnapshots(list);
  }, [resolveActiveSyncFolder, syncEngine]);

  const restoreSafetySnapshot = useCallback(
    async (fileName: string) => {
      const folder = resolveActiveSyncFolder();
      if (!folder) return;
      setIsSyncing(true);
      try {
        const outcome = await syncEngine.restoreSafetySnapshot(folder, fileName);
        await handleSyncOutcome(outcome, false);
        await refreshSafetySnapshots();
      } finally {
        setIsSyncing(false);
      }
    },
    [resolveActiveSyncFolder, syncEngine, handleSyncOutcome, refreshSafetySnapshots]
  );

  const importMasterCsvText = useCallback(
    async (csvText: string, mode: 'replace' | 'merge') => {
      try {
        const decoded = MasterCsvFormat.decode(csvText, false);
        if (mode === 'replace') {
          await commitSnapshotMutation(() => decoded.snapshot);
          const currentP =
            decoded.snapshot.periods.find((p) => p.isCurrent) ??
            decoded.snapshot.periods[0];
          if (currentP) {
            await updateSettings({ selectedPeriodId: currentP.id });
          }
          showSnackbar(
            `Imported ${decoded.snapshot.transactions.length} transactions & ${decoded.snapshot.periods.length} cycle(s) from CSV.`
          );
        } else {
          // Merge by ID preferring imported rows
          await commitSnapshotMutation((prev) => {
            const mergeById = <T extends { id: string }>(a: T[], b: T[]): T[] => {
              const map = new Map<string, T>();
              for (const item of a) map.set(item.id, item);
              for (const item of b) map.set(item.id, item);
              return Array.from(map.values());
            };
            return MasterCsvFormat.validateAndRepair(
              {
                periods: mergeById(prev.periods, decoded.snapshot.periods),
                accounts: mergeById(prev.accounts, decoded.snapshot.accounts),
                categories: mergeById(prev.categories, decoded.snapshot.categories),
                contributors: mergeById(prev.contributors, decoded.snapshot.contributors),
                incomeSources: mergeById(prev.incomeSources, decoded.snapshot.incomeSources),
                allocations: mergeById(prev.allocations, decoded.snapshot.allocations),
                budgetItems: mergeById(prev.budgetItems, decoded.snapshot.budgetItems),
                transactions: mergeById(prev.transactions, decoded.snapshot.transactions),
                recurringTransactions: mergeById(
                  prev.recurringTransactions,
                  decoded.snapshot.recurringTransactions
                ),
                incomeCalculations: mergeById(
                  prev.incomeCalculations,
                  decoded.snapshot.incomeCalculations
                )
              },
              []
            );
          });
          showSnackbar('Merged Master CSV into local data.');
        }
      } catch (err) {
        showSnackbar(
          `CSV Import failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [commitSnapshotMutation, updateSettings, showSnackbar]
  );

  const exportMasterCsvDownload = useCallback(() => {
    const encoded = MasterCsvFormat.encode(snapshotRef.current, {
      revision: Math.max(1, syncBaseRef.current.revision),
      writtenByDeviceId: settingsRef.current.syncDeviceId || 'web-client',
      ancestorHashes: syncBaseRef.current.knownAncestorHashes
    });
    const blob = new Blob([encoded.csvText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = MasterCsvFormat.FILE_NAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSnackbar(`Downloaded ${MasterCsvFormat.FILE_NAME}`);
  }, [showSnackbar]);

  const exportReportCsvsDownload = useCallback(() => {
    const reports = MasterCsvFormat.generateReportFiles(snapshotRef.current);
    for (const [name, content] of Object.entries(reports)) {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    showSnackbar('Downloaded 4 summary report CSVs.');
  }, [showSnackbar]);

  const clearSyncLogs = useCallback(async () => {
    await PersistentBudgetStorage.clearSyncLogs();
    setSyncLogs([]);
  }, []);

  // Settings helpers
  const setBudgetTotalMode = useCallback(
    async (mode: BudgetTotalMode) => {
      await updateSettings({ budgetTotalMode: mode });
    },
    [updateSettings]
  );

  const setPercentageBasis = useCallback(
    async (basis: PercentageBasis) => {
      await updateSettings({ percentageBasis: basis });
    },
    [updateSettings]
  );

  const setThemePalette = useCallback(
    async (palette: ThemePalette) => {
      await updateSettings({ themePalette: palette });
    },
    [updateSettings]
  );

  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      await updateSettings({ themeMode: mode });
    },
    [updateSettings]
  );

  const setConfirmExitEnabled = useCallback(
    async (enabled: boolean) => {
      await updateSettings({ confirmExitEnabled: enabled });
    },
    [updateSettings]
  );

  // Cycle mutations
  const selectPeriod = useCallback(
    async (periodId: string) => {
      await updateSettings({ selectedPeriodId: periodId });
    },
    [updateSettings]
  );

  const createNewPeriod = useCallback(
    async (params: {
      name: string;
      startDate: string;
      numberOfWeeks: number;
      note?: string;
      makeCurrent: boolean;
      copyFromPeriodId: string | null;
      copyBudgetItems: boolean;
      copyContributors: boolean;
    }) => {
      const safeWeeks = Math.max(1, params.numberOfWeeks);
      const endDate = CyclePlanner.computeEndDate(params.startDate, safeWeeks);
      const currentWeek = CyclePlanner.computeCurrentWeek(
        params.startDate,
        safeWeeks,
        todayIso()
      );
      const newPeriodId = randomUuid();
      const newPeriod: BudgetPeriod = {
        id: newPeriodId,
        name: params.name.trim() || CycleSelection.defaultCycleName(params.startDate),
        numberOfWeeks: safeWeeks,
        currentWeek,
        startDate: params.startDate,
        endDate,
        note: (params.note ?? '').trim(),
        isCurrent: params.makeCurrent,
        isArchived: false
      };

      await commitSnapshotMutation((prev) => {
        const updatedPeriods = params.makeCurrent
          ? prev.periods.map((p) => ({ ...p, isCurrent: false }))
          : prev.periods.slice();
        let next: MasterCsvSnapshot = {
          ...prev,
          periods: [...updatedPeriods, newPeriod]
        };
        if (params.copyFromPeriodId) {
          next = SnapshotMutator.copyStructureBetweenCycles({
            snapshot: next,
            fromPeriodId: params.copyFromPeriodId,
            toPeriodId: newPeriodId,
            copyBudgetItems: params.copyBudgetItems,
            copyContributors: params.copyContributors,
            replaceTargetBudgetItems: false
          });
        } else {
          next = {
            ...next,
            contributors: [
              ...next.contributors,
              {
                id: randomUuid(),
                budgetPeriodId: newPeriodId,
                name: 'You',
                weeklyAllowance: 0,
                note: 'Primary contributor'
              }
            ]
          };
        }
        return next;
      });

      await updateSettings({ selectedPeriodId: newPeriodId });
      showSnackbar(`Created cycle "${newPeriod.name}"`);
    },
    [commitSnapshotMutation, updateSettings, showSnackbar]
  );

  const updatePeriod = useCallback(
    async (period: BudgetPeriod) => {
      const safeWeeks = Math.max(1, period.numberOfWeeks);
      const endDate = CyclePlanner.computeEndDate(period.startDate, safeWeeks);
      const currentWeek = CyclePlanner.computeCurrentWeek(
        period.startDate,
        safeWeeks,
        todayIso()
      );
      await commitSnapshotMutation((prev) => ({
        ...prev,
        periods: prev.periods.map((p) => {
          if (p.id === period.id) {
            return {
              ...period,
              numberOfWeeks: safeWeeks,
              endDate,
              currentWeek
            };
          }
          if (period.isCurrent && p.isCurrent) {
            return { ...p, isCurrent: false };
          }
          return p;
        })
      }));
      showSnackbar(`Updated cycle "${period.name}"`);
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const setCurrentPeriod = useCallback(
    async (periodId: string) => {
      await commitSnapshotMutation((prev) => ({
        ...prev,
        periods: prev.periods.map((p) => ({
          ...p,
          isCurrent: p.id === periodId
        }))
      }));
      await updateSettings({ selectedPeriodId: periodId });
      showSnackbar('Active budget cycle updated.');
    },
    [commitSnapshotMutation, updateSettings, showSnackbar]
  );

  const disableCurrentPeriod = useCallback(
    async (periodId: string) => {
      const summaries = snapshotRef.current.periods.map(toCycleSummary);
      const fallbackId = CycleSelection.resolveAfterDisableCurrent(
        periodId,
        summaries,
        todayIso()
      );
      await commitSnapshotMutation((prev) => ({
        ...prev,
        periods: prev.periods.map((p) => ({
          ...p,
          isCurrent: fallbackId ? p.id === fallbackId : false
        }))
      }));
      if (fallbackId) {
        await updateSettings({ selectedPeriodId: fallbackId });
      }
    },
    [commitSnapshotMutation, updateSettings]
  );

  const deletePeriod = useCallback(
    async (periodId: string) => {
      if (snapshotRef.current.periods.length <= 1) {
        showSnackbar('Cannot delete the only budget cycle.');
        return;
      }
      await commitSnapshotMutation((prev) => {
        const next = SnapshotMutator.deletePeriod(prev, periodId);
        if (!next.periods.some((p) => p.isCurrent) && next.periods.length > 0) {
          next.periods = next.periods.map((p, idx) =>
            idx === 0 ? { ...p, isCurrent: true } : p
          );
        }
        return next;
      });
      const fallback =
        snapshotRef.current.periods.find((p) => p.isCurrent) ??
        snapshotRef.current.periods[0];
      if (fallback) {
        await updateSettings({ selectedPeriodId: fallback.id });
      }
      showSnackbar('Deleted budget cycle.');
    },
    [commitSnapshotMutation, updateSettings, showSnackbar]
  );

  const copyBudgetBetweenCycles = useCallback(
    async (params: {
      fromPeriodId: string;
      toPeriodId: string;
      replaceExisting: boolean;
    }) => {
      await commitSnapshotMutation((prev) =>
        SnapshotMutator.copyStructureBetweenCycles({
          snapshot: prev,
          fromPeriodId: params.fromPeriodId,
          toPeriodId: params.toPeriodId,
          copyBudgetItems: true,
          copyContributors: false,
          replaceTargetBudgetItems: params.replaceExisting
        })
      );
      showSnackbar('Copied budget items between cycles.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  // Account & Envelope mutations
  const saveAccount = useCallback(
    async (draft: Omit<Account, 'id'> & { id?: string }): Promise<Account> => {
      const cleanName = normalizeDisplayName(draft.name) || 'Account';
      const id = draft.id || randomUuid();
      const saved: Account = {
        id,
        name: cleanName,
        type: draft.type,
        startingBalance: draft.startingBalance,
        targetAmount: Math.max(0, draft.targetAmount),
        colorHex: draft.colorHex || '#2563EB',
        isArchived: draft.isArchived,
        parentAccountId:
          draft.type === AccountType.ENVELOPE ? draft.parentAccountId : null
      };

      await commitSnapshotMutation((prev) => {
        const exists = prev.accounts.some((a) => a.id === id);
        const accounts = exists
          ? prev.accounts.map((a) => (a.id === id ? saved : a))
          : [...prev.accounts, saved];
        const transactions = prev.transactions.map((t) => ({
          ...t,
          accountName: t.accountId === id ? saved.name : t.accountName,
          toAccountName: t.toAccountId === id ? saved.name : t.toAccountName
        }));
        return {
          ...prev,
          accounts,
          transactions
        };
      });
      showSnackbar(`Saved "${saved.name}"`);
      return saved;
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const deleteAccount = useCallback(
    async (accountId: string, reassignToAccountId: string | null = null) => {
      await commitSnapshotMutation((prev) =>
        SnapshotMutator.deleteAccount(prev, accountId, reassignToAccountId)
      );
      showSnackbar('Deleted account.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const countAccountReferences = useCallback(
    (accountId: string): AccountReferenceCounts =>
      SnapshotMutator.countAccountReferences(snapshotRef.current, accountId),
    []
  );

  // Category mutations
  const saveCategory = useCallback(
    async (draft: Omit<CategoryEntity, 'id'> & { id?: string }) => {
      const cleanName = normalizeDisplayName(draft.name);
      if (!cleanName) return;
      const cleanSubs = Array.from(
        new Set(
          draft.subCategories
            .map((s) => normalizeDisplayName(s))
            .filter((s) => s.length > 0)
        )
      );
      const id = draft.id || randomUuid();
      await commitSnapshotMutation((prev) => {
        const exists = prev.categories.some((c) => c.id === id);
        const saved: CategoryEntity = {
          id,
          name: cleanName,
          subCategories: cleanSubs,
          colorHex: draft.colorHex || '#4F46E5'
        };
        return {
          ...prev,
          categories: exists
            ? prev.categories.map((c) => (c.id === id ? saved : c))
            : [...prev.categories, saved]
        };
      });
      showSnackbar(`Saved category "${cleanName}"`);
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const renameCategory = useCallback(
    async (
      categoryId: string,
      newName: string,
      subCategories: string[],
      colorHex: string
    ) => {
      const cleanNewName = normalizeDisplayName(newName);
      if (!cleanNewName) return;
      const cleanSubs = Array.from(
        new Set(
          subCategories
            .map((s) => normalizeDisplayName(s))
            .filter((s) => s.length > 0)
        )
      );
      await commitSnapshotMutation((prev) => {
        const existing = prev.categories.find((c) => c.id === categoryId);
        if (!existing) return prev;
        const oldLower = existing.name.trim().toLowerCase();
        return {
          ...prev,
          categories: prev.categories.map((c) =>
            c.id === categoryId
              ? { ...c, name: cleanNewName, subCategories: cleanSubs, colorHex }
              : c
          ),
          budgetItems: prev.budgetItems.map((b) =>
            b.category.trim().toLowerCase() === oldLower
              ? { ...b, category: cleanNewName }
              : b
          ),
          transactions: prev.transactions.map((t) =>
            t.category.trim().toLowerCase() === oldLower
              ? { ...t, category: cleanNewName }
              : t
          ),
          recurringTransactions: prev.recurringTransactions.map((r) =>
            r.category.trim().toLowerCase() === oldLower
              ? { ...r, category: cleanNewName }
              : r
          )
        };
      });
      showSnackbar(`Updated category "${cleanNewName}"`);
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      await commitSnapshotMutation((prev) => ({
        ...prev,
        categories: prev.categories.filter((c) => c.id !== categoryId)
      }));
      showSnackbar('Deleted category.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  // Contributor & Cash Flow mutations
  const saveContributorWithDetails = useCallback(
    async (params: {
      id?: string;
      name: string;
      weeklyAllowance: Cents;
      note: string;
      incomeSources: Array<{ id?: string; label: string; weeklyAmount: Cents }>;
      allocations: Array<{
        id?: string;
        accountId: string;
        amount: Cents;
        percentage: number;
      }>;
    }) => {
      const period = selectedPeriod;
      if (!period) return;
      const contributorId = params.id || randomUuid();
      const cleanSources: ContributorIncomeSource[] = params.incomeSources
        .filter((s) => s.label.trim().length > 0 || s.weeklyAmount > 0)
        .map((s) => ({
          id: s.id || randomUuid(),
          contributorId,
          budgetPeriodId: period.id,
          label: s.label.trim() || 'Income',
          weeklyAmount: Math.max(0, s.weeklyAmount)
        }));
      const effectiveAllowance =
        cleanSources.length > 0
          ? cleanSources.reduce((acc, s) => acc + s.weeklyAmount, 0)
          : Math.max(0, params.weeklyAllowance);

      const savedContributor: Contributor = {
        id: contributorId,
        budgetPeriodId: period.id,
        name: params.name.trim() || 'Contributor',
        weeklyAllowance: effectiveAllowance,
        note: params.note.trim()
      };

      const cleanAllocations: ContributionAllocation[] = params.allocations
        .filter((a) => a.accountId && a.amount > 0)
        .map((a) => ({
          id: a.id || randomUuid(),
          budgetPeriodId: period.id,
          contributorId,
          accountId: a.accountId,
          amount: Math.max(0, a.amount),
          percentage: Math.max(0, a.percentage)
        }));

      await commitSnapshotMutation((prev) => {
        const exists = prev.contributors.some((c) => c.id === contributorId);
        const contributors = exists
          ? prev.contributors.map((c) =>
              c.id === contributorId ? savedContributor : c
            )
          : [...prev.contributors, savedContributor];
        const otherSources = prev.incomeSources.filter(
          (s) => s.contributorId !== contributorId
        );
        const otherAllocations = prev.allocations.filter(
          (a) => a.contributorId !== contributorId
        );
        return {
          ...prev,
          contributors,
          incomeSources: [...otherSources, ...cleanSources],
          allocations: [...otherAllocations, ...cleanAllocations]
        };
      });
      showSnackbar(`Saved contributor "${savedContributor.name}"`);
    },
    [selectedPeriod, commitSnapshotMutation, showSnackbar]
  );

  const deleteContributor = useCallback(
    async (contributorId: string) => {
      await commitSnapshotMutation((prev) =>
        SnapshotMutator.deleteContributor(prev, contributorId)
      );
      showSnackbar('Removed contributor.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const createOrUpdateRecurringFromAllocation = useCallback(
    async (params: {
      contributorName: string;
      targetAccount: Account;
      weeklyAmount: Cents;
      frequency: RecurringFrequency;
      startDate: string;
    }) => {
      await commitSnapshotMutation((prev) => {
        const existing = RecurringContribution.existingMatch(
          prev.recurringTransactions,
          params.targetAccount.id,
          params.contributorName,
          params.targetAccount.name
        );
        const built = RecurringContribution.buildNew({
          contributorName: params.contributorName,
          targetAccount: params.targetAccount,
          weeklyAmount: params.weeklyAmount,
          frequency: params.frequency,
          startDate: params.startDate,
          cleared: true
        });
        if (existing) {
          const updated = {
            ...built,
            id: existing.id
          };
          return {
            ...prev,
            recurringTransactions: prev.recurringTransactions.map((r) =>
              r.id === existing.id ? updated : r
            )
          };
        }
        return {
          ...prev,
          recurringTransactions: [...prev.recurringTransactions, built]
        };
      });
      showSnackbar(
        `Scheduled recurring contribution to ${params.targetAccount.name}`
      );
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const saveIncomeCalculation = useCallback(
    async (calc: Omit<IncomeCalculation, 'id'> & { id?: string }) => {
      const id = calc.id || randomUuid();
      const saved: IncomeCalculation = {
        ...calc,
        id
      };
      await commitSnapshotMutation((prev) => {
        const exists = prev.incomeCalculations.some((c) => c.id === id);
        return {
          ...prev,
          incomeCalculations: exists
            ? prev.incomeCalculations.map((c) => (c.id === id ? saved : c))
            : [...prev.incomeCalculations, saved]
        };
      });
      showSnackbar('Saved income calculation.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const deleteIncomeCalculation = useCallback(
    async (id: string) => {
      await commitSnapshotMutation((prev) => ({
        ...prev,
        incomeCalculations: prev.incomeCalculations.filter((c) => c.id !== id)
      }));
      showSnackbar('Deleted income calculation.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  // Budget Item mutations
  const saveBudgetItem = useCallback(
    async (draft: Omit<BudgetItem, 'id'> & { id?: string }) => {
      const id = draft.id || randomUuid();
      const cleanCategory = normalizeDisplayName(draft.category) || 'Uncategorized';
      const cleanSub = normalizeDisplayName(draft.subCategory);
      const saved: BudgetItem = {
        id,
        budgetPeriodId: draft.budgetPeriodId,
        category: cleanCategory,
        subCategory: cleanSub,
        amount: Math.max(0, draft.amount),
        frequency: draft.frequency,
        targetAccountId: draft.targetAccountId,
        expenseType: draft.expenseType
      };
      await commitSnapshotMutation((prev) => {
        const withCat = SnapshotMutator.ensureCategoryExists(
          prev,
          cleanCategory,
          cleanSub
        );
        const exists = withCat.budgetItems.some((b) => b.id === id);
        return {
          ...withCat,
          budgetItems: exists
            ? withCat.budgetItems.map((b) => (b.id === id ? saved : b))
            : [...withCat.budgetItems, saved]
        };
      });
    },
    [commitSnapshotMutation]
  );

  const deleteBudgetItem = useCallback(
    async (id: string) => {
      await commitSnapshotMutation((prev) => ({
        ...prev,
        budgetItems: prev.budgetItems.filter((b) => b.id !== id)
      }));
      showSnackbar('Removed budget line.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const recordCoverFromEnvelope = useCallback(
    async (params: {
      envelopeAccountId: string;
      destinationAccountId: string;
      category: string;
      subCategory: string;
      amount: Cents;
      date: string;
      note: string;
    }) => {
      const period = selectedPeriod;
      if (!period) return;
      const env = snapshotRef.current.accounts.find(
        (a) => a.id === params.envelopeAccountId
      );
      const dest = snapshotRef.current.accounts.find(
        (a) => a.id === params.destinationAccountId
      );
      if (!env || !dest) {
        showSnackbar('Please select both an envelope and a destination account.');
        return;
      }
      const coverTx = EnvelopeCoverage.buildCoverTransaction({
        budgetPeriodId: period.id,
        envelope: env,
        destination: dest,
        category: params.category,
        subCategory: params.subCategory,
        amount: params.amount,
        date: params.date,
        note: params.note,
        cleared: true
      });
      await commitSnapshotMutation((prev) => ({
        ...prev,
        transactions: [...prev.transactions, coverTx]
      }));
      showSnackbar(`Covered ${params.category} from ${env.name}`);
    },
    [selectedPeriod, commitSnapshotMutation, showSnackbar]
  );

  const undoCoverTransfer = useCallback(
    async (transactionId: string) => {
      await commitSnapshotMutation((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== transactionId)
      }));
      showSnackbar('Cover transfer undone.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  // Transaction mutations (with sticky session date retention for reconciliation!)
  const saveTransaction = useCallback(
    async (
      draft: Omit<
        Transaction,
        | 'id'
        | 'budgetPeriodId'
        | 'accountName'
        | 'toAccountName'
        | 'syncedToMasterSheet'
        | 'createdAt'
      > & {
        id?: string;
        budgetPeriodId?: string;
        createdAt?: number;
        repeatFrequency?: RecurringFrequency | null;
        isDuplicate?: boolean;
      }
    ) => {
      const isNew = !draft.id;
      const txDate = draft.date.trim() || sessionLastTransactionDate || todayIso();

      // Match BudgetViewModel.kt:896: resolve period by transaction date when adding
      const periodId =
        draft.budgetPeriodId ??
        (isNew
          ? RecurringSchedule.periodIdFor(txDate, snapshotRef.current.periods) ??
            selectedPeriod?.id
          : selectedPeriod?.id);
      if (!periodId) return;

      // Always retain the set date in the session when adding a new non-duplicate transaction
      if (isNew && !draft.isDuplicate) {
        setSessionLastTransactionDate(txDate);
      }

      const ruleId = draft.repeatFrequency ? randomUuid() : null;
      const id =
        draft.id ||
        (ruleId
          ? RecurringSchedule.deterministicTransactionId(ruleId, txDate)
          : randomUuid());

      const cleanCategory =
        draft.type === TransactionType.TRANSFER
          ? draft.category.trim()
          : normalizeDisplayName(draft.category) || 'Uncategorized';
      const cleanSub =
        draft.type === TransactionType.TRANSFER
          ? draft.subCategory.trim()
          : normalizeDisplayName(draft.subCategory);

      await commitSnapshotMutation((prev) => {
        const fromAcc = draft.accountId
          ? prev.accounts.find((a) => a.id === draft.accountId)
          : undefined;
        const toAcc = draft.toAccountId
          ? prev.accounts.find((a) => a.id === draft.toAccountId)
          : undefined;

        const savedTx: Transaction = {
          id,
          budgetPeriodId: periodId,
          accountId: draft.accountId,
          accountName: fromAcc?.name ?? '',
          toAccountId:
            draft.type === TransactionType.TRANSFER ? draft.toAccountId : null,
          toAccountName:
            draft.type === TransactionType.TRANSFER ? toAcc?.name ?? '' : '',
          contributorId: draft.contributorId,
          category: cleanCategory,
          subCategory: cleanSub,
          amount: Math.max(0, draft.amount),
          type: draft.type,
          date: txDate,
          note: draft.note.trim(),
          payee: draft.payee.trim(),
          tag: draft.tag.trim(),
          isRecurring: Boolean(draft.isRecurring || draft.repeatFrequency),
          cleared: draft.cleared,
          syncedToMasterSheet: false,
          createdAt: draft.createdAt ?? Date.now()
        };

        let next =
          draft.type !== TransactionType.TRANSFER && cleanCategory
            ? SnapshotMutator.ensureCategoryExists(prev, cleanCategory, cleanSub)
            : prev;

        const exists = next.transactions.some((t) => t.id === id);
        const transactions = exists
          ? next.transactions.map((t) => (t.id === id ? savedTx : t))
          : [...next.transactions, savedTx];

        let recurringTransactions = next.recurringTransactions;
        if (draft.repeatFrequency && ruleId) {
          const nextDue =
            RecurringSchedule.nextAfter(
              txDate,
              draft.repeatFrequency,
              txDate < todayIso() ? todayIso() : txDate
            ) ?? RecurringSchedule.advanceDate(txDate, draft.repeatFrequency);
          const rule: RecurringTransaction = {
            id: ruleId,
            title:
              savedTx.note ||
              savedTx.payee ||
              cleanCategory ||
              'Recurring Transaction',
            amount: savedTx.amount,
            type: savedTx.type,
            accountId: savedTx.accountId,
            toAccountId: savedTx.toAccountId,
            category: savedTx.category,
            subCategory: savedTx.subCategory,
            frequency: draft.repeatFrequency,
            startDate: txDate,
            nextDueDate: nextDue,
            active: true,
            cleared: savedTx.cleared
          };
          recurringTransactions = [...recurringTransactions, rule];
        }

        return {
          ...next,
          transactions,
          recurringTransactions
        };
      });

      showSnackbar(isNew ? 'Transaction added.' : 'Transaction updated.');
    },
    [
      selectedPeriod,
      sessionLastTransactionDate,
      setSessionLastTransactionDate,
      commitSnapshotMutation,
      showSnackbar
    ]
  );

  const toggleTransactionCleared = useCallback(
    async (transactionId: string) => {
      if (!transactionsEditable) return;
      await commitSnapshotMutation((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) =>
          t.id === transactionId
            ? { ...t, cleared: !t.cleared, syncedToMasterSheet: false }
            : t
        )
      }));
    },
    [transactionsEditable, commitSnapshotMutation]
  );

  const deleteTransaction = useCallback(
    async (transactionId: string) => {
      const target = snapshotRef.current.transactions.find(
        (t) => t.id === transactionId
      );
      if (!target) return;
      setLastDeletedTransaction(target);
      await commitSnapshotMutation((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== transactionId)
      }));
      showSnackbar('Transaction deleted.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const undoDeleteTransaction = useCallback(async () => {
    if (!lastDeletedTransaction) return;
    const restored = lastDeletedTransaction;
    setLastDeletedTransaction(null);
    await commitSnapshotMutation((prev) => ({
      ...prev,
      transactions: [...prev.transactions, restored]
    }));
    showSnackbar('Transaction restored.');
  }, [lastDeletedTransaction, commitSnapshotMutation, showSnackbar]);

  // Recurring rule mutations
  const saveRecurringRule = useCallback(
    async (draft: Omit<RecurringTransaction, 'id'> & { id?: string }) => {
      const id = draft.id || randomUuid();
      const saved: RecurringTransaction = {
        ...draft,
        id,
        title: draft.title.trim() || draft.category.trim() || 'Recurring',
        category: normalizeDisplayName(draft.category),
        subCategory: normalizeDisplayName(draft.subCategory),
        amount: Math.max(0, draft.amount)
      };
      await commitSnapshotMutation((prev) => {
        const exists = prev.recurringTransactions.some((r) => r.id === id);
        return {
          ...prev,
          recurringTransactions: exists
            ? prev.recurringTransactions.map((r) => (r.id === id ? saved : r))
            : [...prev.recurringTransactions, saved]
        };
      });
      showSnackbar(`Saved recurring rule "${saved.title}"`);
    },
    [commitSnapshotMutation, showSnackbar]
  );

  const toggleRecurringRuleActive = useCallback(
    async (ruleId: string) => {
      await commitSnapshotMutation((prev) => ({
        ...prev,
        recurringTransactions: prev.recurringTransactions.map((r) =>
          r.id === ruleId ? { ...r, active: !r.active } : r
        )
      }));
    },
    [commitSnapshotMutation]
  );

  const deleteRecurringRule = useCallback(
    async (ruleId: string) => {
      await commitSnapshotMutation((prev) => ({
        ...prev,
        recurringTransactions: prev.recurringTransactions.filter(
          (r) => r.id !== ruleId
        )
      }));
      showSnackbar('Deleted recurring rule.');
    },
    [commitSnapshotMutation, showSnackbar]
  );

  // Reset actions
  const resetCurrentCycleData = useCallback(async () => {
    if (!selectedPeriod) return;
    await commitSnapshotMutation((prev) =>
      SnapshotMutator.resetPeriodData(prev, selectedPeriod.id)
    );
    showSnackbar(`Reset data for "${selectedPeriod.name}".`);
  }, [selectedPeriod, commitSnapshotMutation, showSnackbar]);

  const resetAllAppData = useCallback(async () => {
    const fresh = SnapshotMutator.resetAllData();
    await commitSnapshotMutation(() => fresh);
    if (fresh.periods[0]) {
      await updateSettings({ selectedPeriodId: fresh.periods[0].id });
    }
    showSnackbar('All app data reset to defaults.');
  }, [commitSnapshotMutation, updateSettings, showSnackbar]);

  const value = useMemo<BudgetContextValue>(
    () => ({
      isHydrated,
      snapshot,
      settings,
      syncBaseState,
      syncLogs,
      safetySnapshots,
      selectedPeriod,
      selectedCycleStatus,
      cyclePickGroups,
      computedCurrentWeek,
      computedYearProgress,
      transactionsEditable,
      activeAccounts,
      archivedAccounts,
      accountBalances,
      balanceById,
      periodContributors,
      periodIncomeSources,
      effectiveWeeklyIncomeByContributor,
      totalWeeklyIncome,
      periodAllocations,
      totalAllocatedWeekly,
      unallocatedWeeklyIncome,
      periodBudgetItems,
      totalWeeklyBudget,
      remainingWeeklyAfterBudget,
      periodTransactions,
      budgetProgress,
      coveredByLineInSelectedCycle,
      transactionSuggestions,
      sessionLastTransactionDate,
      setSessionLastTransactionDate,
      snackbarMessage,
      clearSnackbar,
      lastDeletedTransaction,
      undoDeleteTransaction,
      syncIndicator,
      isSyncing,
      syncAttentionOutcome,
      pendingMassDeletion,
      pendingLinkDecision,
      loadFromFolderPreview,
      isDrivePickerOpen,
      drivePickerUser,
      isClientIdModalOpen,
      setIsClientIdModalOpen,
      closeDrivePicker,
      startGoogleDriveLinkFlow,
      reconnectGoogleDriveSession,
      completeGoogleDriveFolderSelection,
      linkLocalFolderFsa,
      unlinkSyncFolder,
      syncMasterCsvNow,
      resolvePendingLinkDecision,
      confirmPendingMassDeletion,
      dismissPendingMassDeletion,
      resolveSyncConflict,
      previewLoadFromFolder,
      confirmLoadFromFolder,
      dismissLoadFromFolderPreview,
      refreshSafetySnapshots,
      restoreSafetySnapshot,
      importMasterCsvText,
      exportMasterCsvDownload,
      exportReportCsvsDownload,
      clearSyncLogs,
      updateSettings,
      setBudgetTotalMode,
      setPercentageBasis,
      setThemePalette,
      setThemeMode,
      setConfirmExitEnabled,
      selectPeriod,
      createNewPeriod,
      updatePeriod,
      setCurrentPeriod,
      disableCurrentPeriod,
      deletePeriod,
      copyBudgetBetweenCycles,
      saveAccount,
      deleteAccount,
      countAccountReferences,
      saveCategory,
      renameCategory,
      deleteCategory,
      saveContributorWithDetails,
      deleteContributor,
      createOrUpdateRecurringFromAllocation,
      saveIncomeCalculation,
      deleteIncomeCalculation,
      saveBudgetItem,
      deleteBudgetItem,
      recordCoverFromEnvelope,
      undoCoverTransfer,
      saveTransaction,
      toggleTransactionCleared,
      deleteTransaction,
      saveRecurringRule,
      toggleRecurringRuleActive,
      deleteRecurringRule,
      resetCurrentCycleData,
      resetAllAppData
    }),
    [
      isHydrated,
      snapshot,
      settings,
      syncBaseState,
      syncLogs,
      safetySnapshots,
      selectedPeriod,
      selectedCycleStatus,
      cyclePickGroups,
      computedCurrentWeek,
      computedYearProgress,
      transactionsEditable,
      activeAccounts,
      archivedAccounts,
      accountBalances,
      balanceById,
      periodContributors,
      periodIncomeSources,
      effectiveWeeklyIncomeByContributor,
      totalWeeklyIncome,
      periodAllocations,
      totalAllocatedWeekly,
      unallocatedWeeklyIncome,
      periodBudgetItems,
      totalWeeklyBudget,
      remainingWeeklyAfterBudget,
      periodTransactions,
      budgetProgress,
      coveredByLineInSelectedCycle,
      transactionSuggestions,
      sessionLastTransactionDate,
      setSessionLastTransactionDate,
      snackbarMessage,
      clearSnackbar,
      lastDeletedTransaction,
      undoDeleteTransaction,
      syncIndicator,
      isSyncing,
      syncAttentionOutcome,
      pendingMassDeletion,
      pendingLinkDecision,
      loadFromFolderPreview,
      isDrivePickerOpen,
      drivePickerUser,
      isClientIdModalOpen,
      closeDrivePicker,
      startGoogleDriveLinkFlow,
      reconnectGoogleDriveSession,
      completeGoogleDriveFolderSelection,
      linkLocalFolderFsa,
      unlinkSyncFolder,
      syncMasterCsvNow,
      resolvePendingLinkDecision,
      confirmPendingMassDeletion,
      dismissPendingMassDeletion,
      resolveSyncConflict,
      previewLoadFromFolder,
      confirmLoadFromFolder,
      dismissLoadFromFolderPreview,
      refreshSafetySnapshots,
      restoreSafetySnapshot,
      importMasterCsvText,
      exportMasterCsvDownload,
      exportReportCsvsDownload,
      clearSyncLogs,
      updateSettings,
      setBudgetTotalMode,
      setPercentageBasis,
      setThemePalette,
      setThemeMode,
      setConfirmExitEnabled,
      selectPeriod,
      createNewPeriod,
      updatePeriod,
      setCurrentPeriod,
      disableCurrentPeriod,
      deletePeriod,
      copyBudgetBetweenCycles,
      saveAccount,
      deleteAccount,
      countAccountReferences,
      saveCategory,
      renameCategory,
      deleteCategory,
      saveContributorWithDetails,
      deleteContributor,
      createOrUpdateRecurringFromAllocation,
      saveIncomeCalculation,
      deleteIncomeCalculation,
      saveBudgetItem,
      deleteBudgetItem,
      recordCoverFromEnvelope,
      undoCoverTransfer,
      saveTransaction,
      toggleTransactionCleared,
      deleteTransaction,
      saveRecurringRule,
      toggleRecurringRuleActive,
      deleteRecurringRule,
      resetCurrentCycleData,
      resetAllAppData
    ]
  );

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
};

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) {
    throw new Error('useBudget() must be used inside <BudgetProvider>');
  }
  return ctx;
}
