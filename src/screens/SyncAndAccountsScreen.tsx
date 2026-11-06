import React, { useRef, useState } from 'react';
import {
  Archive,
  Calendar,
  Cloud,
  Download,
  Edit3,
  FileSpreadsheet,
  FolderOpen,
  History,
  KeyRound,
  Palette,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  ShieldAlert,
  Tag,
  Trash2,
  Unlink,
  Upload,
  Wallet,
  X
} from 'lucide-react';
import {
  ACCOUNT_TYPE_LABELS,
  ALL_RECURRING_FREQUENCIES,
  Account,
  AccountType,
  BudgetPeriod,
  CategoryEntity,
  RECURRING_FREQUENCY_LABELS,
  RecurringFrequency,
  RecurringTransaction,
  ThemeMode,
  ThemePalette,
  TransactionType,
  totalAccountReferences
} from '../domain/models';
import { CentsMath, Money } from '../domain/cents';
import { todayIso } from '../domain/localDate';
import {
  ACCOUNT_PRESET_COLORS,
  PALETTE_DEFINITIONS
} from '../theme/palettes';
import { useBudget } from '../state/BudgetContext';

export const SyncAndAccountsScreen: React.FC = () => {
  const {
    snapshot,
    settings,
    syncBaseState,
    syncLogs,
    safetySnapshots,
    isSyncing,
    balanceById,
    startGoogleDriveLinkFlow,
    reconnectGoogleDriveSession,
    linkLocalFolderFsa,
    unlinkSyncFolder,
    syncMasterCsvNow,
    previewLoadFromFolder,
    refreshSafetySnapshots,
    restoreSafetySnapshot,
    importMasterCsvText,
    exportMasterCsvDownload,
    exportReportCsvsDownload,
    clearSyncLogs,
    setIsClientIdModalOpen,
    setThemePalette,
    setThemeMode,
    setConfirmExitEnabled,
    setCurrentPeriod,
    disableCurrentPeriod,
    updatePeriod,
    deletePeriod,
    saveAccount,
    deleteAccount,
    countAccountReferences,
    saveCategory,
    renameCategory,
    deleteCategory,
    saveRecurringRule,
    toggleRecurringRuleActive,
    deleteRecurringRule,
    resetCurrentCycleData,
    resetAllAppData
  } = useBudget();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');

  const [showSnapshotsModal, setShowSnapshotsModal] = useState(false);
  const [showSyncHistoryModal, setShowSyncHistoryModal] = useState(false);

  // Account Modal State
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>(AccountType.CHECKING);
  const [accStartingInput, setAccStartingInput] = useState('0.00');
  const [accTargetInput, setAccTargetInput] = useState('0.00');
  const [accColor, setAccColor] = useState('#2563EB');
  const [accParentId, setAccParentId] = useState('');
  const [accArchived, setAccArchived] = useState(false);

  // Delete Account with Reassignment Dialog State
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [reassignAccountId, setReassignAccountId] = useState<string>('');

  // Category Modal State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CategoryEntity | null>(null);
  const [catName, setCatName] = useState('');
  const [catSubsInput, setCatSubsInput] = useState('');
  const [catColor, setCatColor] = useState('#4F46E5');

  // Recurring Rule Modal State
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] =
    useState<RecurringTransaction | null>(null);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleType, setRuleType] = useState<TransactionType>(
    TransactionType.EXPENSE
  );
  const [ruleAmountInput, setRuleAmountInput] = useState('');
  const [ruleAccountId, setRuleAccountId] = useState('');
  const [ruleToAccountId, setRuleToAccountId] = useState('');
  const [ruleCategory, setRuleCategory] = useState('');
  const [ruleSubCategory, setRuleSubCategory] = useState('');
  const [ruleFrequency, setRuleFrequency] = useState<RecurringFrequency>(
    RecurringFrequency.MONTHLY
  );
  const [ruleStartDate, setRuleStartDate] = useState(todayIso());
  const [ruleNextDueDate, setRuleNextDueDate] = useState(todayIso());
  const [ruleCleared, setRuleCleared] = useState(true);

  // Edit Cycle Modal State
  const [editingCycle, setEditingCycle] = useState<BudgetPeriod | null>(null);
  const [cycleName, setCycleName] = useState('');
  const [cycleStartDate, setCycleStartDate] = useState('');
  const [cycleWeeks, setCycleWeeks] = useState('52');
  const [cycleNote, setCycleNote] = useState('');

  // Reset Confirmation Dialog State
  const [confirmResetKind, setConfirmResetKind] = useState<
    'cycle' | 'all' | null
  >(null);

  const openAccountModal = (acc?: Account) => {
    if (acc) {
      setEditingAccount(acc);
      setAccName(acc.name);
      setAccType(acc.type);
      setAccStartingInput(CentsMath.toPlain(acc.startingBalance));
      setAccTargetInput(CentsMath.toPlain(acc.targetAmount));
      setAccColor(acc.colorHex);
      setAccParentId(acc.parentAccountId ?? '');
      setAccArchived(acc.isArchived);
    } else {
      setEditingAccount(null);
      setAccName('');
      setAccType(AccountType.CHECKING);
      setAccStartingInput('0.00');
      setAccTargetInput('0.00');
      setAccColor(
        ACCOUNT_PRESET_COLORS[
          snapshot.accounts.length % ACCOUNT_PRESET_COLORS.length
        ]
      );
      setAccParentId('');
      setAccArchived(false);
    }
    setAccountModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveAccount({
      id: editingAccount?.id,
      name: accName,
      type: accType,
      startingBalance: CentsMath.parse(accStartingInput),
      targetAmount: CentsMath.parse(accTargetInput),
      colorHex: accColor,
      isArchived: accArchived,
      parentAccountId: accType === AccountType.ENVELOPE ? accParentId || null : null
    });
    setAccountModalOpen(false);
  };

  const openCategoryModal = (cat?: CategoryEntity) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatSubsInput(cat.subCategories.join(', '));
      setCatColor(cat.colorHex);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatSubsInput('');
      setCatColor('#4F46E5');
    }
    setCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const subs = catSubsInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (editingCategory) {
      await renameCategory(editingCategory.id, catName, subs, catColor);
    } else {
      await saveCategory({
        name: catName,
        subCategories: subs,
        colorHex: catColor
      });
    }
    setCategoryModalOpen(false);
  };

  const openRuleModal = (rule?: RecurringTransaction) => {
    if (rule) {
      setEditingRule(rule);
      setRuleTitle(rule.title);
      setRuleType(rule.type);
      setRuleAmountInput(CentsMath.toPlain(rule.amount));
      setRuleAccountId(rule.accountId ?? '');
      setRuleToAccountId(rule.toAccountId ?? '');
      setRuleCategory(rule.category);
      setRuleSubCategory(rule.subCategory);
      setRuleFrequency(rule.frequency);
      setRuleStartDate(rule.startDate);
      setRuleNextDueDate(rule.nextDueDate);
      setRuleCleared(rule.cleared);
    } else {
      setEditingRule(null);
      setRuleTitle('');
      setRuleType(TransactionType.EXPENSE);
      setRuleAmountInput('');
      setRuleAccountId(snapshot.accounts[0]?.id ?? '');
      setRuleToAccountId('');
      setRuleCategory(snapshot.categories[0]?.name ?? '');
      setRuleSubCategory('');
      setRuleFrequency(RecurringFrequency.MONTHLY);
      setRuleStartDate(todayIso());
      setRuleNextDueDate(todayIso());
      setRuleCleared(true);
    }
    setRuleModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = CentsMath.parse(ruleAmountInput);
    if (cents <= 0) return;
    await saveRecurringRule({
      id: editingRule?.id,
      title: ruleTitle.trim() || ruleCategory.trim() || 'Recurring',
      type: ruleType,
      amount: cents,
      accountId: ruleAccountId || null,
      toAccountId:
        ruleType === TransactionType.TRANSFER ? ruleToAccountId || null : null,
      category: ruleType === TransactionType.TRANSFER ? '' : ruleCategory,
      subCategory: ruleType === TransactionType.TRANSFER ? '' : ruleSubCategory,
      frequency: ruleFrequency,
      startDate: ruleStartDate,
      nextDueDate: ruleNextDueDate || ruleStartDate,
      active: editingRule ? editingRule.active : true,
      cleared: ruleCleared
    });
    setRuleModalOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importMasterCsvText(text, importMode);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 1. Master CSV & Google Drive Sync Section */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: 'var(--primary-container)',
                color: 'var(--on-primary-container)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Cloud size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                Google Drive &amp; Master CSV Sync
              </h2>
              <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                Syncs <code>weekly-budget-master.csv</code> (Protocol v3) between your
                Android phone and this web app
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() => setIsClientIdModalOpen(true)}
            title="Configure Google Cloud OAuth Client ID"
          >
            <KeyRound size={14} />
            OAuth Client ID
          </button>
        </div>

        {/* Linked Status Box */}
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: 'var(--surface-container)',
            border: '1px solid var(--outline-variant)',
            marginBottom: 14
          }}
        >
          {settings.masterSyncFolderUri ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                  Linked Folder: {settings.masterSyncFolderLabel || 'Sync Folder'}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--on-surface-variant)',
                    marginTop: 2
                  }}
                >
                  {settings.masterSyncType === 'gdrive' &&
                    settings.googleAccountEmail && (
                      <span>
                        Google Account: <strong>{settings.googleAccountEmail}</strong> ·{' '}
                      </span>
                    )}
                  Revision: <strong className="mono-num">r{syncBaseState.revision}</strong>
                  {settings.lastMasterSyncAtMillis > 0 && (
                    <span>
                      {' '}
                      · Last synced:{' '}
                      {new Date(settings.lastMasterSyncAtMillis).toLocaleString()}
                    </span>
                  )}
                </div>
                {settings.lastMasterSyncStatus && (
                  <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                    Status: {settings.lastMasterSyncStatus}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isSyncing}
                  onClick={() => void syncMasterCsvNow(false)}
                >
                  <RefreshCw size={15} />
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
                {settings.masterSyncType === 'gdrive' && (
                  <button
                    type="button"
                    className="btn btn-tonal"
                    onClick={() => void reconnectGoogleDriveSession()}
                    title="Refresh Google Drive access token"
                  >
                    Reconnect Google
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                  No Sync Folder Linked Yet
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                  Click <strong>Link Folder</strong> → Proceed to Google to select your
                  account → Choose your budget folder in Google Drive
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void startGoogleDriveLinkFlow()}
              >
                <Cloud size={16} />
                Link Folder (Google Drive)
              </button>
            </div>
          )}
        </div>

        {/* Sync Action Buttons Row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-tonal"
            onClick={() => void startGoogleDriveLinkFlow()}
          >
            <Cloud size={15} />
            {settings.masterSyncFolderUri
              ? 'Change Google Drive Folder'
              : 'Link Folder'}
          </button>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void linkLocalFolderFsa()}
          >
            <FolderOpen size={15} />
            Link Local Folder
          </button>

          {settings.masterSyncFolderUri && (
            <>
              <button
                type="button"
                className="btn btn-outline"
                disabled={isSyncing}
                onClick={() => void previewLoadFromFolder()}
              >
                <Download size={15} />
                Load from Folder
              </button>

              <button
                type="button"
                className="btn btn-outline"
                disabled={isSyncing}
                onClick={() => void syncMasterCsvNow(true)}
              >
                <FileSpreadsheet size={15} />
                Sync + Write Reports
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  await refreshSafetySnapshots();
                  setShowSnapshotsModal(true);
                }}
              >
                <RotateCcw size={15} />
                Safety Snapshots (.trash)
              </button>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowSyncHistoryModal(true)}
              >
                <History size={15} />
                Sync History ({syncLogs.length})
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--expense)' }}
                onClick={() => void unlinkSyncFolder()}
              >
                <Unlink size={15} />
                Unlink
              </button>
            </>
          )}
        </div>

        {/* Direct File Import / Export Fallback */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--outline-variant)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
            Direct CSV Backup &amp; Reports:
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => void handleFileUpload(e)}
            />
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 11px', fontSize: 12.5 }}
              onClick={() => {
                setImportMode('replace');
                fileInputRef.current?.click();
              }}
            >
              <Upload size={14} />
              Import Master CSV
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 11px', fontSize: 12.5 }}
              onClick={exportMasterCsvDownload}
            >
              <Download size={14} />
              Export weekly-budget-master.csv
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 11px', fontSize: 12.5 }}
              onClick={exportReportCsvsDownload}
            >
              <FileSpreadsheet size={14} />
              Download 4 Report CSVs
            </button>
          </div>
        </div>
      </div>

      {/* 2. Appearance (6 Palettes x 3 Modes) */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Palette size={20} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700 }}>
                Appearance &amp; Theme Palettes
              </h3>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                Matches all 6 Android Material 3 color palettes
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {Object.values(ThemeMode).map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${settings.themeMode === m ? 'active' : ''}`}
                onClick={() => void setThemeMode(m)}
              >
                {m === ThemeMode.SYSTEM
                  ? 'System'
                  : m === ThemeMode.LIGHT
                  ? 'Light'
                  : 'Dark'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-3">
          {Object.values(ThemePalette).map((palKey) => {
            const meta = PALETTE_DEFINITIONS[palKey];
            const selected = settings.themePalette === palKey;
            return (
              <div
                key={palKey}
                onClick={() => void setThemePalette(palKey)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: selected
                    ? '2px solid var(--primary)'
                    : '1px solid var(--outline-variant)',
                  backgroundColor: selected
                    ? 'var(--primary-container)'
                    : 'var(--surface-container)',
                  color: selected
                    ? 'var(--on-primary-container)'
                    : 'var(--on-surface)',
                  cursor: 'pointer'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{meta.displayName}</strong>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {meta.swatches.map((hex, i) => (
                      <span
                        key={i}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          backgroundColor: hex,
                          border: '1px solid rgba(255,255,255,0.4)'
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.85 }}>{meta.tagline}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Accounts & Envelopes Management */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Wallet size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700 }}>
              Accounts &amp; Envelopes ({snapshot.accounts.length})
            </h3>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '7px 12px', fontSize: 12.5 }}
            onClick={() => openAccountModal()}
          >
            <Plus size={15} />
            Add Account / Envelope
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {snapshot.accounts.map((acc) => {
            const detail = balanceById.get(acc.id);
            const parent = acc.parentAccountId
              ? snapshot.accounts.find((a) => a.id === acc.parentAccountId)
              : null;
            return (
              <div
                key={acc.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  backgroundColor: 'var(--surface-container)',
                  border: '1px solid var(--outline-variant)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                  opacity: acc.isArchived ? 0.65 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: acc.colorHex
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {acc.name}{' '}
                      {acc.isArchived && (
                        <span
                          className="badge"
                          style={{
                            backgroundColor: 'var(--surface-variant)',
                            fontSize: 10.5
                          }}
                        >
                          Archived
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                      {ACCOUNT_TYPE_LABELS[acc.type]}
                      {parent && ` · Inside ${parent.name}`} · Starting:{' '}
                      {Money.format(acc.startingBalance)}
                      {acc.targetAmount > 0 &&
                        ` · Target: ${Money.format(acc.targetAmount)}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono-num" style={{ fontWeight: 700, fontSize: 14 }}>
                    {Money.format(detail?.currentBalance ?? acc.startingBalance)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 8px' }}
                    onClick={() => openAccountModal(acc)}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 8px', color: 'var(--expense)' }}
                    onClick={() => {
                      setDeletingAccount(acc);
                      setReassignAccountId('');
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Budget Cycles Management */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12
          }}
        >
          <Calendar size={20} style={{ color: 'var(--primary)' }} />
          <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700 }}>
            Budget Cycles ({snapshot.periods.length})
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {snapshot.periods.map((p) => (
            <div
              key={p.id}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                backgroundColor: 'var(--surface-container)',
                border: '1px solid var(--outline-variant)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {p.name}{' '}
                  {p.isCurrent && (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: 'var(--primary-container)',
                        color: 'var(--on-primary-container)',
                        marginLeft: 6
                      }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                  {p.startDate} → {p.endDate} ({p.numberOfWeeks} weeks)
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.isCurrent ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    onClick={() => void disableCurrentPeriod(p.id)}
                  >
                    Unset Current
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-tonal"
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    onClick={() => void setCurrentPeriod(p.id)}
                  >
                    Make Current
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '5px 8px' }}
                  onClick={() => {
                    setEditingCycle(p);
                    setCycleName(p.name);
                    setCycleStartDate(p.startDate);
                    setCycleWeeks(String(p.numberOfWeeks));
                    setCycleNote(p.note);
                  }}
                >
                  <Edit3 size={14} />
                </button>
                {snapshot.periods.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '5px 8px', color: 'var(--expense)' }}
                    onClick={() => void deletePeriod(p.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Categories & Recurring Rules Grid */}
      <div className="grid-2">
        {/* Categories */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag size={18} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Categories ({snapshot.categories.length})
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-tonal"
              style={{ padding: '5px 10px', fontSize: 12 }}
              onClick={() => openCategoryModal()}
            >
              <Plus size={14} /> Add
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 320,
              overflowY: 'auto'
            }}
          >
            {snapshot.categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: 'var(--surface-container)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{cat.name}</div>
                  {cat.subCategories.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>
                      {cat.subCategories.join(' · ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 7px' }}
                    onClick={() => openCategoryModal(cat)}
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 7px', color: 'var(--expense)' }}
                    onClick={() => void deleteCategory(cat.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recurring Rules */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Repeat size={18} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Recurring Rules ({snapshot.recurringTransactions.length})
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-tonal"
              style={{ padding: '5px 10px', fontSize: 12 }}
              onClick={() => openRuleModal()}
            >
              <Plus size={14} /> Add Rule
            </button>
          </div>

          {snapshot.recurringTransactions.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--on-surface-variant)',
                fontSize: 13
              }}
            >
              No recurring transactions configured yet.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 320,
                overflowY: 'auto'
              }}
            >
              {snapshot.recurringTransactions.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    backgroundColor: 'var(--surface-container)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    opacity: rule.active ? 1 : 0.6
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {rule.title} ({Money.format(rule.amount)})
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>
                      {RECURRING_FREQUENCY_LABELS[rule.frequency]} · Next due:{' '}
                      {rule.nextDueDate}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      className="chip"
                      style={{ padding: '3px 8px', fontSize: 11 }}
                      onClick={() => void toggleRecurringRuleActive(rule.id)}
                    >
                      {rule.active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '4px 7px' }}
                      onClick={() => openRuleModal(rule)}
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '4px 7px', color: 'var(--expense)' }}
                      onClick={() => void deleteRecurringRule(rule.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6. App Preferences & Danger Zone */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 16, fontWeight: 700 }}>
          Preferences &amp; Reset
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13.5,
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={settings.confirmExitEnabled}
              onChange={(e) => void setConfirmExitEnabled(e.target.checked)}
            />
            Warn before closing browser tab when unsynced local changes exist
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ color: 'var(--expense)' }}
              onClick={() => setConfirmResetKind('cycle')}
            >
              Reset Current Cycle
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmResetKind('all')}
            >
              Reset All Data
            </button>
          </div>
        </div>
      </div>

      {/* Account Add/Edit Modal */}
      {accountModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setAccountModalOpen(false)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                {editingAccount ? 'Edit Account / Envelope' : 'Add Account / Envelope'}
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setAccountModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveAccount}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div className="grid-2">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Account Name
                  </label>
                  <input
                    className="input"
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                    placeholder="e.g. Chase Checking, Emergency Fund"
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Type
                  </label>
                  <select
                    className="select"
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as AccountType)}
                  >
                    {Object.values(AccountType).map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {accType === AccountType.ENVELOPE && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Parent Cash Account (Checking / Savings holding this envelope)
                  </label>
                  <select
                    className="select"
                    value={accParentId}
                    onChange={(e) => setAccParentId(e.target.value)}
                  >
                    <option value="">Standalone (No parent account)</option>
                    {snapshot.accounts
                      .filter(
                        (a) =>
                          a.id !== editingAccount?.id &&
                          (a.type === AccountType.CHECKING ||
                            a.type === AccountType.SAVINGS)
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="grid-2">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Starting Balance ($)
                  </label>
                  <input
                    className="input mono-num"
                    value={accStartingInput}
                    onChange={(e) => setAccStartingInput(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Target / Goal Amount ($)
                  </label>
                  <input
                    className="input mono-num"
                    value={accTargetInput}
                    onChange={(e) => setAccTargetInput(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 6
                  }}
                >
                  Color
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ACCOUNT_PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setAccColor(hex)}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        backgroundColor: hex,
                        border:
                          accColor === hex
                            ? '3px solid var(--on-surface)'
                            : '1px solid transparent',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13.5
                }}
              >
                <input
                  type="checkbox"
                  checked={accArchived}
                  onChange={(e) => setAccArchived(e.target.checked)}
                />
                <Archive size={14} /> Archive this account (hide from active pickers)
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setAccountModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account with Reference Reassignment Modal */}
      {deletingAccount && (
        <div
          className="modal-backdrop"
          onClick={() => setDeletingAccount(null)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const refs = countAccountReferences(deletingAccount.id);
              const totalRefs = totalAccountReferences(refs);
              return (
                <>
                  <h3 style={{ marginTop: 0, fontSize: 17, fontWeight: 700 }}>
                    Delete &ldquo;{deletingAccount.name}&rdquo;?
                  </h3>
                  {totalRefs > 0 ? (
                    <>
                      <p
                        style={{
                          fontSize: 13,
                          color: 'var(--on-surface-variant)'
                        }}
                      >
                        This account is referenced by{' '}
                        <strong>
                          {refs.transactionsFrom + refs.transactionsTo}
                        </strong>{' '}
                        transaction(s), <strong>{refs.allocations}</strong>{' '}
                        allocation(s), <strong>{refs.budgetItems}</strong> budget
                        line(s), and <strong>{refs.childEnvelopes}</strong> child
                        envelope(s).
                      </p>
                      <div style={{ marginBottom: 14 }}>
                        <label
                          style={{
                            display: 'block',
                            fontSize: 12.5,
                            fontWeight: 600,
                            marginBottom: 5
                          }}
                        >
                          Reassign references to (optional):
                        </label>
                        <select
                          className="select"
                          value={reassignAccountId}
                          onChange={(e) => setReassignAccountId(e.target.value)}
                        >
                          <option value="">
                            Do not reassign (clear account reference)
                          </option>
                          {snapshot.accounts
                            .filter((a) => a.id !== deletingAccount.id)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <p
                      style={{
                        fontSize: 13.5,
                        color: 'var(--on-surface-variant)'
                      }}
                    >
                      This account has no linked transactions or allocations.
                    </p>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setDeletingAccount(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={async () => {
                        await deleteAccount(
                          deletingAccount.id,
                          reassignAccountId || null
                        );
                        setDeletingAccount(null);
                      }}
                    >
                      Delete Account
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Category Add/Edit Modal */}
      {categoryModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setCategoryModalOpen(false)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: 17, fontWeight: 700 }}>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </h3>
            <form
              onSubmit={handleSaveCategory}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 5
                  }}
                >
                  Category Name
                </label>
                <input
                  className="input"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 5
                  }}
                >
                  Sub-Categories (comma-separated)
                </label>
                <input
                  className="input"
                  value={catSubsInput}
                  onChange={(e) => setCatSubsInput(e.target.value)}
                  placeholder="e.g. Electric, Water, Internet"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCategoryModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recurring Rule Modal */}
      {ruleModalOpen && (
        <div className="modal-backdrop" onClick={() => setRuleModalOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 500 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: 17, fontWeight: 700 }}>
              {editingRule ? 'Edit Recurring Rule' : 'New Recurring Rule'}
            </h3>
            <form
              onSubmit={handleSaveRule}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div className="grid-2">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Title / Payee
                  </label>
                  <input
                    className="input"
                    value={ruleTitle}
                    onChange={(e) => setRuleTitle(e.target.value)}
                    placeholder="e.g. Rent, Paycheck, Netflix"
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Type
                  </label>
                  <select
                    className="select"
                    value={ruleType}
                    onChange={(e) =>
                      setRuleType(e.target.value as TransactionType)
                    }
                  >
                    <option value={TransactionType.EXPENSE}>Expense</option>
                    <option value={TransactionType.INCOME}>Income</option>
                    <option value={TransactionType.TRANSFER}>Transfer</option>
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Amount ($)
                  </label>
                  <input
                    className="input mono-num"
                    value={ruleAmountInput}
                    onChange={(e) => setRuleAmountInput(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Frequency
                  </label>
                  <select
                    className="select"
                    value={ruleFrequency}
                    onChange={(e) =>
                      setRuleFrequency(e.target.value as RecurringFrequency)
                    }
                  >
                    {ALL_RECURRING_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {RECURRING_FREQUENCY_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid-2">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Account
                  </label>
                  <select
                    className="select"
                    value={ruleAccountId}
                    onChange={(e) => setRuleAccountId(e.target.value)}
                  >
                    <option value="">Select account...</option>
                    {snapshot.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                {ruleType === TransactionType.TRANSFER ? (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 5
                      }}
                    >
                      To Account
                    </label>
                    <select
                      className="select"
                      value={ruleToAccountId}
                      onChange={(e) => setRuleToAccountId(e.target.value)}
                    >
                      <option value="">Select destination...</option>
                      {snapshot.accounts
                        .filter((a) => a.id !== ruleAccountId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12.5,
                        fontWeight: 600,
                        marginBottom: 5
                      }}
                    >
                      Category
                    </label>
                    <input
                      className="input"
                      value={ruleCategory}
                      onChange={(e) => setRuleCategory(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="grid-2">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="input mono-num"
                    value={ruleStartDate}
                    onChange={(e) => setRuleStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Next Due Date
                  </label>
                  <input
                    type="date"
                    className="input mono-num"
                    value={ruleNextDueDate}
                    onChange={(e) => setRuleNextDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRuleModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Cycle Modal */}
      {editingCycle && (
        <div className="modal-backdrop" onClick={() => setEditingCycle(null)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: 17, fontWeight: 700 }}>
              Edit Budget Cycle
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await updatePeriod({
                  ...editingCycle,
                  name: cycleName.trim() || editingCycle.name,
                  startDate: cycleStartDate,
                  numberOfWeeks: Math.max(1, Number.parseInt(cycleWeeks, 10) || 52),
                  note: cycleNote
                });
                setEditingCycle(null);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 5
                  }}
                >
                  Cycle Name
                </label>
                <input
                  className="input"
                  value={cycleName}
                  onChange={(e) => setCycleName(e.target.value)}
                  required
                />
              </div>
              <div className="grid-2">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Start Date
                  </label>
                  <input
                    type="date"
                    className="input mono-num"
                    value={cycleStartDate}
                    onChange={(e) => setCycleStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Number of Weeks
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={104}
                    className="input mono-num"
                    value={cycleWeeks}
                    onChange={(e) => setCycleWeeks(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 5
                  }}
                >
                  Note
                </label>
                <input
                  className="input"
                  value={cycleNote}
                  onChange={(e) => setCycleNote(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditingCycle(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safety Snapshots (.trash) Modal */}
      {showSnapshotsModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowSnapshotsModal(false)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Safety Snapshots (.trash)
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setShowSnapshotsModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
              Up to 10 rolling backups of <code>weekly-budget-master.csv</code> are
              kept in <code>.trash/</code> before each remote write.
            </p>
            {safetySnapshots.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--on-surface-variant)',
                  fontSize: 13
                }}
              >
                No safety snapshots found in <code>.trash/</code> yet.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 300,
                  overflowY: 'auto'
                }}
              >
                {safetySnapshots.map((snap) => (
                  <div
                    key={snap.name}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      backgroundColor: 'var(--surface-container)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10
                    }}
                  >
                    <div>
                      <div
                        className="mono-num"
                        style={{ fontWeight: 600, fontSize: 13 }}
                      >
                        {snap.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--on-surface-variant)'
                        }}
                      >
                        {snap.lastModifiedMillis > 0 &&
                          new Date(snap.lastModifiedMillis).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-tonal"
                      style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={async () => {
                        await restoreSafetySnapshot(snap.name);
                        setShowSnapshotsModal(false);
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sync History Modal */}
      {showSyncHistoryModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowSyncHistoryModal(false)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Sync History Log
              </h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {syncLogs.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => void clearSyncLogs()}
                  >
                    Clear Log
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowSyncHistoryModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            {syncLogs.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--on-surface-variant)',
                  fontSize: 13
                }}
              >
                No sync events recorded yet.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 340,
                  overflowY: 'auto'
                }}
              >
                {syncLogs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 10,
                      backgroundColor: 'var(--surface-container)',
                      fontSize: 12.5
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 600
                      }}
                    >
                      <span>{log.message}</span>
                      <span className="mono-num">r{log.revision}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--on-surface-variant)',
                        marginTop: 2
                      }}
                    >
                      {new Date(log.timestampMillis).toLocaleString()} ·{' '}
                      {log.direction} · hash {log.contentHash}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Reset Modal */}
      {confirmResetKind && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmResetKind(null)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <ShieldAlert size={22} style={{ color: 'var(--expense)' }} />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                {confirmResetKind === 'all'
                  ? 'Reset All App Data?'
                  : 'Reset Current Cycle Data?'}
              </h3>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)' }}>
              {confirmResetKind === 'all'
                ? 'This resets all cycles, accounts, categories, and transactions in this browser back to fresh starter defaults.'
                : 'This clears contributors, budget lines, and transactions in the currently selected budget cycle.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setConfirmResetKind(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  if (confirmResetKind === 'all') {
                    await resetAllAppData();
                  } else {
                    await resetCurrentCycleData();
                  }
                  setConfirmResetKind(null);
                }}
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
