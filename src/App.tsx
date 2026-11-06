import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  PieChart,
  Receipt,
  Settings,
  Users,
  X
} from 'lucide-react';
import { BudgetProvider, useBudget } from './state/BudgetContext';
import { TopBarAndCyclePicker } from './components/TopBarAndCyclePicker';
import { MasterSyncDialogs } from './components/MasterSyncDialogs';
import {
  GoogleClientIdSetupModal,
  GoogleDriveFolderPickerModal
} from './components/GoogleDriveFolderPickerModal';
import { ContributorsCashFlowScreen } from './screens/ContributorsCashFlowScreen';
import { BudgetBreakdownScreen } from './screens/BudgetBreakdownScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { TransactionsScreen } from './screens/TransactionsScreen';
import { SyncAndAccountsScreen } from './screens/SyncAndAccountsScreen';

const TABS = [
  { index: 0, label: 'Cash flow', icon: Users },
  { index: 1, label: 'Budget', icon: PieChart },
  { index: 2, label: 'Dashboard', icon: LayoutDashboard },
  { index: 3, label: 'Ledger', icon: Receipt },
  { index: 4, label: 'Settings', icon: Settings }
] as const;

const BudgetAppShell: React.FC = () => {
  const {
    isHydrated,
    snackbarMessage,
    clearSnackbar,
    lastDeletedTransaction,
    undoDeleteTransaction
  } = useBudget();

  // Default tab is 2 (Dashboard), matching Android AppTabs.kt
  const [selectedTab, setSelectedTab] = useState<number>(2);
  const [ledgerInitialAccountId, setLedgerInitialAccountId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!snackbarMessage) return;
    const t = window.setTimeout(() => {
      clearSnackbar();
    }, 4500);
    return () => window.clearTimeout(t);
  }, [snackbarMessage, clearSnackbar]);

  const handleNavigateTab = (tabIndex: number, accountId?: string | null) => {
    if (accountId !== undefined) {
      setLedgerInitialAccountId(accountId);
    }
    setSelectedTab(tabIndex);
  };

  if (!isHydrated) {
    return (
      <div
        className="app-shell"
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 15,
          color: 'var(--on-surface-variant)'
        }}
      >
        Loading Weekly Budget...
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBarAndCyclePicker onNavigateToSettings={() => setSelectedTab(4)} />
      <MasterSyncDialogs />

      <main className="main-container">
        {selectedTab === 0 && <ContributorsCashFlowScreen />}
        {selectedTab === 1 && <BudgetBreakdownScreen />}
        {selectedTab === 2 && (
          <DashboardScreen onNavigateTab={handleNavigateTab} />
        )}
        {selectedTab === 3 && (
          <TransactionsScreen
            initialAccountId={ledgerInitialAccountId}
            onClearInitialAccount={() => setLedgerInitialAccountId(null)}
          />
        )}
        {selectedTab === 4 && <SyncAndAccountsScreen />}
      </main>

      <nav className="bottom-nav" aria-label="Primary Navigation">
        <div className="bottom-nav-inner">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = selectedTab === tab.index;
            return (
              <button
                key={tab.index}
                type="button"
                className={`nav-tab-btn ${active ? 'active' : ''}`}
                onClick={() => setSelectedTab(tab.index)}
              >
                <Icon size={19} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Google Drive Folder Chooser & OAuth Client ID Setup Modals */}
      <GoogleDriveFolderPickerModal />
      <GoogleClientIdSetupModal />

      {/* Snackbar with Undo Delete Transaction */}
      {snackbarMessage && (
        <div className="snackbar" role="status">
          <span>{snackbarMessage}</span>
          {lastDeletedTransaction &&
            snackbarMessage.includes('Transaction deleted') && (
              <button
                type="button"
                onClick={() => void undoDeleteTransaction()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#34d399',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                UNDO
              </button>
            )}
          <button
            type="button"
            onClick={clearSnackbar}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 2,
              display: 'flex'
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => (
  <BudgetProvider>
    <BudgetAppShell />
  </BudgetProvider>
);

export default App;
