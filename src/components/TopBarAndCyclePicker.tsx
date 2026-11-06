import React, { useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CloudOff,
  Plus,
  RefreshCw,
  X
} from 'lucide-react';
import {
  CyclePlanner,
  CycleSelection,
  CycleStatus,
  CycleSummary
} from '../domain/cyclePlanner';
import { CyclePlan } from '../domain/cents';
import { todayIso } from '../domain/localDate';
import { SyncIndicatorState } from '../sync/syncModels';
import { useBudget } from '../state/BudgetContext';

export const TopBarAndCyclePicker: React.FC<{
  onNavigateToSettings: () => void;
}> = ({ onNavigateToSettings }) => {
  const {
    snapshot,
    settings,
    selectedPeriod,
    selectedCycleStatus,
    cyclePickGroups,
    computedCurrentWeek,
    syncIndicator,
    isSyncing,
    selectPeriod,
    createNewPeriod,
    syncMasterCsvNow,
    startGoogleDriveLinkFlow
  } = useBudget();

  const [cycleMenuOpen, setCycleMenuOpen] = useState(false);
  const [pendingPastCycle, setPendingPastCycle] = useState<CycleSummary | null>(null);
  const [newCycleOpen, setNewCycleOpen] = useState(false);

  // New Cycle Modal State
  const latestEndDate =
    snapshot.periods
      .slice()
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0]?.endDate ?? null;
  const defaultPlan = CyclePlanner.nextCyclePlan(latestEndDate, 52, todayIso());

  const [newCycleName, setNewCycleName] = useState('');
  const [newStartDate, setNewStartDate] = useState(defaultPlan.startDate);
  const [newWeeks, setNewWeeks] = useState(String(defaultPlan.weeks));
  const [newNote, setNewNote] = useState('');
  const [makeCurrent, setMakeCurrent] = useState(snapshot.periods.length === 0);
  const [copyFromPeriodId, setCopyFromPeriodId] = useState<string>(
    selectedPeriod?.id ?? snapshot.periods[0]?.id ?? ''
  );
  const [copyBudgetItems, setCopyBudgetItems] = useState(true);
  const [copyContributors, setCopyContributors] = useState(true);

  const openNewCycleModal = () => {
    const plan = CyclePlanner.nextCyclePlan(latestEndDate, 52, todayIso());
    setNewStartDate(plan.startDate);
    setNewWeeks(String(plan.weeks));
    setNewCycleName(
      CycleSelection.defaultCycleName(
        plan.startDate,
        snapshot.periods.map((p) => p.name)
      )
    );
    setNewNote('');
    setMakeCurrent(false);
    setCopyFromPeriodId(selectedPeriod?.id ?? snapshot.periods[0]?.id ?? '');
    setCopyBudgetItems(true);
    setCopyContributors(true);
    setCycleMenuOpen(false);
    setNewCycleOpen(true);
  };

  const handleSelectCycle = (c: CycleSummary) => {
    setCycleMenuOpen(false);
    if (CycleSelection.needsPastCycleConfirmation(c, todayIso())) {
      setPendingPastCycle(c);
    } else {
      void selectPeriod(c.id);
    }
  };

  const handleCreateCycleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weeks = Math.max(1, Number.parseInt(newWeeks, 10) || 52);
    await createNewPeriod({
      name: newCycleName,
      startDate: newStartDate,
      numberOfWeeks: weeks,
      note: newNote,
      makeCurrent,
      copyFromPeriodId: copyFromPeriodId || null,
      copyBudgetItems,
      copyContributors
    });
    setNewCycleOpen(false);
  };

  const renderStatusBadge = (status: CycleStatus) => {
    switch (status) {
      case CycleStatus.CURRENT:
        return (
          <span
            className="badge"
            style={{
              backgroundColor: 'var(--primary-container)',
              color: 'var(--on-primary-container)'
            }}
          >
            Current
          </span>
        );
      case CycleStatus.UPCOMING:
        return (
          <span
            className="badge"
            style={{
              backgroundColor: 'var(--secondary-container)',
              color: 'var(--secondary)'
            }}
          >
            Upcoming
          </span>
        );
      case CycleStatus.PAST:
        return (
          <span
            className="badge"
            style={{
              backgroundColor: 'var(--surface-container-high)',
              color: 'var(--on-surface-variant)'
            }}
          >
            Past (Read-Only Ledger)
          </span>
        );
    }
  };

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="brand-group">
            <div className="brand-logo">WB</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em' }}>
                Weekly Budget
              </div>
              {selectedPeriod && (
                <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                  Week {computedCurrentWeek} of {selectedPeriod.numberOfWeeks} ·{' '}
                  {selectedPeriod.startDate} → {selectedPeriod.endDate}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Cycle Selector Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '7px 12px' }}
                onClick={() => setCycleMenuOpen((v) => !v)}
              >
                <Calendar size={15} style={{ color: 'var(--primary)' }} />
                <span>{selectedPeriod?.name ?? 'Select Cycle'}</span>
                {renderStatusBadge(selectedCycleStatus)}
                <ChevronDown size={15} />
              </button>

              {cycleMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 6px)',
                    width: 320,
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--outline)',
                    borderRadius: 14,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                    padding: 10,
                    zIndex: 60
                  }}
                >
                  {cyclePickGroups.current && (
                    <div style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--on-surface-variant)',
                          padding: '4px 8px'
                        }}
                      >
                        Current Cycle
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectCycle(cyclePickGroups.current!)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor:
                            selectedPeriod?.id === cyclePickGroups.current.id
                              ? 'var(--primary-container)'
                              : 'transparent',
                          color: 'var(--on-surface)'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                          {cyclePickGroups.current.name}
                        </div>
                        <div style={{ fontSize: 11.5, opacity: 0.8 }}>
                          {cyclePickGroups.current.startDate} →{' '}
                          {cyclePickGroups.current.endDate} (
                          {cyclePickGroups.current.numberOfWeeks}w)
                        </div>
                      </button>
                    </div>
                  )}

                  {cyclePickGroups.upcoming.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--on-surface-variant)',
                          padding: '4px 8px'
                        }}
                      >
                        Upcoming Cycles
                      </div>
                      {cyclePickGroups.upcoming.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCycle(c)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 10px',
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor:
                              selectedPeriod?.id === c.id
                                ? 'var(--primary-container)'
                                : 'transparent',
                            color: 'var(--on-surface)'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, opacity: 0.75 }}>
                            {c.startDate} → {c.endDate}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {cyclePickGroups.past.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--on-surface-variant)',
                          padding: '4px 8px'
                        }}
                      >
                        Past Cycles
                      </div>
                      {cyclePickGroups.past.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCycle(c)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 10px',
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor:
                              selectedPeriod?.id === c.id
                                ? 'var(--primary-container)'
                                : 'transparent',
                            color: 'var(--on-surface)'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, opacity: 0.75 }}>
                            {c.startDate} → {c.endDate}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      borderTop: '1px solid var(--outline-variant)',
                      paddingTop: 8,
                      marginTop: 4
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-tonal"
                      style={{ width: '100%' }}
                      onClick={openNewCycleModal}
                    >
                      <Plus size={15} />
                      New Budget Cycle
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sync Status Pill */}
            {syncIndicator === SyncIndicatorState.NOT_LINKED ? (
              <button
                type="button"
                className="btn btn-tonal"
                style={{ padding: '7px 12px', fontSize: 12.5 }}
                onClick={() => void startGoogleDriveLinkFlow()}
                title="Link a Google Drive folder to sync with your Android phone"
              >
                <CloudOff size={15} />
                Link Google Drive
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '7px 12px', fontSize: 12.5 }}
                  onClick={() => void syncMasterCsvNow(false)}
                  disabled={isSyncing}
                  title={
                    settings.lastMasterSyncStatus ||
                    `Linked to ${settings.masterSyncFolderLabel}`
                  }
                >
                  {syncIndicator === SyncIndicatorState.SYNCING ? (
                    <>
                      <RefreshCw size={14} style={{ color: 'var(--primary)' }} />
                      <span>Syncing...</span>
                    </>
                  ) : syncIndicator === SyncIndicatorState.NEEDS_ATTENTION ? (
                    <>
                      <AlertCircle size={14} style={{ color: 'var(--warning)' }} />
                      <span>Needs Attention</span>
                    </>
                  ) : syncIndicator === SyncIndicatorState.PENDING ? (
                    <>
                      <Cloud size={14} style={{ color: 'var(--primary)' }} />
                      <span>Sync Pending</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} style={{ color: 'var(--income)' }} />
                      <span>{settings.masterSyncFolderLabel || 'In Sync'}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '7px 9px' }}
                  onClick={onNavigateToSettings}
                  title="Sync settings"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Past Cycle Read-Only Confirmation Dialog */}
      {pendingPastCycle && (
        <div className="modal-backdrop" onClick={() => setPendingPastCycle(null)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: 17, fontWeight: 700 }}>
              Switch to Past Cycle &ldquo;{pendingPastCycle.name}&rdquo;?
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              This cycle ended on <strong>{pendingPastCycle.endDate}</strong>. You can
              inspect its dashboard, budget, and ledger history, or promote it to Current
              in Settings if you need to add transactions to it.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setPendingPastCycle(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const id = pendingPastCycle.id;
                  setPendingPastCycle(null);
                  void selectPeriod(id);
                }}
              >
                View Past Cycle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Budget Cycle Dialog */}
      {newCycleOpen && (
        <div className="modal-backdrop" onClick={() => setNewCycleOpen(false)}>
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
                marginBottom: 14
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Create New Budget Cycle
              </h3>
              <button className="btn btn-ghost" onClick={() => setNewCycleOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleCreateCycleSubmit}
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
                  value={newCycleName}
                  onChange={(e) => setNewCycleName(e.target.value)}
                  placeholder="e.g. 2027 Budget"
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
                    Start Date (Monday recommended)
                  </label>
                  <input
                    type="date"
                    className="input mono-num"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
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
                    value={newWeeks}
                    onChange={(e) => setNewWeeks(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                    Ends{' '}
                    {CyclePlanner.computeEndDate(
                      newStartDate,
                      Math.max(1, Number.parseInt(newWeeks, 10) || 52)
                    )}{' '}
                    ({CyclePlan.formatMonthsCount(Math.max(1, Number.parseInt(newWeeks, 10) || 52))})
                  </div>
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
                  Copy Setup From Cycle
                </label>
                <select
                  className="select"
                  value={copyFromPeriodId}
                  onChange={(e) => setCopyFromPeriodId(e.target.value)}
                >
                  <option value="">Start blank (no copied items)</option>
                  {snapshot.periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.startDate} → {p.endDate})
                    </option>
                  ))}
                </select>
              </div>

              {copyFromPeriodId && (
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: 'var(--surface-container)'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={copyBudgetItems}
                      onChange={(e) => setCopyBudgetItems(e.target.checked)}
                    />
                    Copy budget lines
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={copyContributors}
                      onChange={(e) => setCopyContributors(e.target.checked)}
                    />
                    Copy contributors &amp; allocations
                  </label>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={makeCurrent}
                  onChange={(e) => setMakeCurrent(e.target.checked)}
                />
                Set as Current active cycle immediately
              </label>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 5
                  }}
                >
                  Note (optional)
                </label>
                <input
                  className="input"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Cycle notes..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setNewCycleOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Cycle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
