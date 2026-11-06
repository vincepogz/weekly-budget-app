import React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  GitMerge,
  RefreshCw,
  ShieldAlert,
  X
} from 'lucide-react';
import {
  ConflictResolutionChoice,
  LinkFolderResolution,
  MasterCsvSummary,
  SYNC_TABLE_META
} from '../sync/syncModels';
import { useBudget } from '../state/BudgetContext';

const SummaryCard: React.FC<{ title: string; summary: MasterCsvSummary }> = ({
  title,
  summary
}) => (
  <div
    style={{
      padding: 14,
      borderRadius: 12,
      backgroundColor: 'var(--surface-container)',
      border: '1px solid var(--outline-variant)',
      fontSize: 13
    }}
  >
    <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
      <span>Cycles:</span>
      <strong className="mono-num">{summary.cyclesCount}</strong>
      <span>Accounts:</span>
      <strong className="mono-num">
        {summary.accountsCount} (+{summary.envelopesCount} env)
      </strong>
      <span>Budget lines:</span>
      <strong className="mono-num">{summary.budgetItemsCount}</strong>
      <span>Transactions:</span>
      <strong className="mono-num">{summary.transactionsCount}</strong>
      <span>Recurring rules:</span>
      <strong className="mono-num">{summary.recurringCount}</strong>
      <span>Revision:</span>
      <strong className="mono-num">r{summary.revision}</strong>
    </div>
    {summary.activeCycleName && (
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--on-surface-variant)' }}>
        Active: <strong>{summary.activeCycleName}</strong>
      </div>
    )}
  </div>
);

export const MasterSyncDialogs: React.FC = () => {
  const {
    pendingLinkDecision,
    resolvePendingLinkDecision,
    pendingMassDeletion,
    confirmPendingMassDeletion,
    dismissPendingMassDeletion,
    loadFromFolderPreview,
    confirmLoadFromFolder,
    dismissLoadFromFolderPreview,
    syncAttentionOutcome,
    resolveSyncConflict,
    reconnectGoogleDriveSession
  } = useBudget();

  return (
    <>
      {/* 1. Link Decision Dialog (when both Browser and Folder have data) */}
      {pendingLinkDecision && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: 620 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <GitMerge size={22} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Both This Browser and the Folder Have Budget Data
              </h3>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', marginTop: 0 }}>
              Choose how to combine your existing browser data with the{' '}
              <code>weekly-budget-master.csv</code> found in the linked folder:
            </p>

            <div className="grid-2" style={{ marginBottom: 16 }}>
              <SummaryCard
                title="Folder (weekly-budget-master.csv)"
                summary={pendingLinkDecision.remoteSummary}
              />
              <SummaryCard
                title="This Browser"
                summary={pendingLinkDecision.localSummary}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
                onClick={() =>
                  void resolvePendingLinkDecision(LinkFolderResolution.USE_FOLDER_DATA)
                }
              >
                <ArrowDownToLine size={18} />
                <div style={{ textAlign: 'left' }}>
                  <div>Use Folder Data (Recommended when linking to phone folder)</div>
                  <div style={{ fontSize: 11.5, opacity: 0.85, fontWeight: 400 }}>
                    Replaces browser starter data with the folder&apos;s Master CSV
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="btn btn-tonal"
                style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
                onClick={() =>
                  void resolvePendingLinkDecision(LinkFolderResolution.MERGE_BOTH)
                }
              >
                <GitMerge size={18} />
                <div style={{ textAlign: 'left' }}>
                  <div>Merge Both</div>
                  <div style={{ fontSize: 11.5, opacity: 0.85, fontWeight: 400 }}>
                    Combines records from both sides by ID
                  </div>
                </div>
              </button>

              <button
                type="button"
                className="btn btn-outline"
                style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
                onClick={() =>
                  void resolvePendingLinkDecision(
                    LinkFolderResolution.OVERWRITE_FOLDER_WITH_DEVICE
                  )
                }
              >
                <ArrowUpFromLine size={18} />
                <div style={{ textAlign: 'left' }}>
                  <div>Overwrite Folder with Browser Data</div>
                  <div style={{ fontSize: 11.5, opacity: 0.75, fontWeight: 400 }}>
                    Saves a safety snapshot of the folder file first, then writes browser data
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Mass Deletion Guard Dialog */}
      {pendingMassDeletion && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <ShieldAlert size={22} style={{ color: 'var(--expense)' }} />
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Confirm Large Deletion During Sync
              </h3>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              Sync detected that{' '}
              <strong>
                {pendingMassDeletion.deletedCount} of {pendingMassDeletion.baseCount}
              </strong>{' '}
              rows in{' '}
              <strong>{SYNC_TABLE_META[pendingMassDeletion.table].label}</strong> would be
              removed (leaving {pendingMassDeletion.remainingCount}).
            </p>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
              A safety snapshot is automatically saved in <code>.trash/</code> before applying.
              Do you want to proceed?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={dismissPendingMassDeletion}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void confirmPendingMassDeletion()}
              >
                Confirm &amp; Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Load from Folder Preview Dialog */}
      {loadFromFolderPreview && (
        <div className="modal-backdrop" onClick={dismissLoadFromFolderPreview}>
          <div
            className="modal-panel"
            style={{ maxWidth: 620 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Load Data from Linked Folder
              </h3>
              <button className="btn btn-ghost" onClick={dismissLoadFromFolderPreview}>
                <X size={18} />
              </button>
            </div>
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <SummaryCard
                title="Folder (weekly-budget-master.csv)"
                summary={loadFromFolderPreview.remoteSummary}
              />
              <SummaryCard
                title="Current Browser Data"
                summary={loadFromFolderPreview.localSummary}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={dismissLoadFromFolderPreview}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-tonal"
                onClick={() => void confirmLoadFromFolder(LinkFolderResolution.MERGE_BOTH)}
              >
                Merge Folder &amp; Browser
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  void confirmLoadFromFolder(LinkFolderResolution.USE_FOLDER_DATA)
                }
              >
                Replace Browser with Folder Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Sync Attention Banner (shown when auth expired or conflict needs resolution) */}
      {syncAttentionOutcome && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.14)',
            borderBottom: '1px solid var(--warning)',
            padding: '10px 20px'
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span>{syncAttentionOutcome.message}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {syncAttentionOutcome.reason === 'AUTH_EXPIRED' ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '6px 12px', fontSize: 12.5 }}
                  onClick={() => void reconnectGoogleDriveSession()}
                >
                  <RefreshCw size={14} />
                  Reconnect Google
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-tonal"
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() =>
                      void resolveSyncConflict(
                        ConflictResolutionChoice.MERGE_PREFER_REMOTE
                      )
                    }
                  >
                    Merge (Prefer Folder)
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() =>
                      void resolveSyncConflict(
                        ConflictResolutionChoice.MERGE_PREFER_LOCAL
                      )
                    }
                  >
                    Merge (Prefer Browser)
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '6px 12px', fontSize: 12.5 }}
                    onClick={() =>
                      void resolveSyncConflict(ConflictResolutionChoice.ACCEPT_REMOTE)
                    }
                  >
                    Use Folder
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
