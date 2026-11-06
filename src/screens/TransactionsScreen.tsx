import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Copy,
  Edit3,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import { Transaction, TransactionType } from '../domain/models';
import { Money } from '../domain/cents';
import { todayIso } from '../domain/localDate';
import { CoverSummary, EnvelopeCoverage } from '../domain/envelopeCoverage';
import { useBudget } from '../state/BudgetContext';
import { TransactionModal } from '../components/TransactionModal';

type ClearedFilter = 'ALL' | 'CLEARED' | 'UNCLEARED';

export const TransactionsScreen: React.FC<{
  initialAccountId?: string | null;
  onClearInitialAccount?: () => void;
}> = ({ initialAccountId, onClearInitialAccount }) => {
  const {
    snapshot,
    transactionsEditable,
    activeAccounts,
    balanceById,
    periodTransactions,
    sessionLastTransactionDate,
    setSessionLastTransactionDate,
    toggleTransactionCleared,
    deleteTransaction,
    undoCoverTransfer
  } = useBudget();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialAccountId ?? null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<TransactionType | 'ALL'>('ALL');
  const [clearedFilter, setClearedFilter] = useState<ClearedFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [inspectingCover, setInspectingCover] = useState<CoverSummary | null>(null);

  useEffect(() => {
    if (initialAccountId) {
      setSelectedAccountId(initialAccountId);
      onClearInitialAccount?.();
    }
  }, [initialAccountId, onClearInitialAccount]);

  const selectedAccountDetail = selectedAccountId
    ? balanceById.get(selectedAccountId) ?? null
    : null;

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return periodTransactions.filter((tx) => {
      if (selectedAccountId) {
        if (tx.accountId !== selectedAccountId && tx.toAccountId !== selectedAccountId) {
          return false;
        }
      }
      if (selectedType !== 'ALL' && tx.type !== selectedType) {
        return false;
      }
      if (clearedFilter === 'CLEARED' && !tx.cleared) {
        return false;
      }
      if (clearedFilter === 'UNCLEARED' && tx.cleared) {
        return false;
      }
      if (
        selectedCategory &&
        tx.category.trim().toLowerCase() !== selectedCategory.toLowerCase()
      ) {
        return false;
      }
      if (q) {
        const amountStr = Money.format(tx.amount).toLowerCase();
        const hay = [
          tx.payee,
          tx.category,
          tx.subCategory,
          tx.note,
          tx.tag,
          tx.accountName,
          tx.toAccountName,
          tx.date,
          amountStr
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    periodTransactions,
    selectedAccountId,
    selectedType,
    clearedFilter,
    selectedCategory,
    searchQuery
  ]);

  const groupedByDate = useMemo(() => {
    const groups: Array<{ date: string; items: Transaction[] }> = [];
    for (const tx of filteredTransactions) {
      const last = groups[groups.length - 1];
      if (last && last.date === tx.date) {
        last.items.push(tx);
      } else {
        groups.push({ date: tx.date, items: [tx] });
      }
    }
    return groups;
  }, [filteredTransactions]);

  const handleOpenAdd = () => {
    setEditingTx(null);
    setIsDuplicating(false);
    setModalOpen(true);
  };

  const handleOpenEdit = (tx: Transaction) => {
    const cover = EnvelopeCoverage.parse(tx);
    if (cover) {
      setInspectingCover(cover);
      return;
    }
    setEditingTx(tx);
    setIsDuplicating(false);
    setModalOpen(true);
  };

  const handleOpenDuplicate = (tx: Transaction) => {
    setEditingTx({
      ...tx,
      id: '',
      date: todayIso(),
      cleared: true,
      isRecurring: false
    });
    setIsDuplicating(true);
    setModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header & Reconciliation Session Date Bar */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
            Transactions Ledger
          </h2>
          <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
            {filteredTransactions.length} transaction(s) shown · Click Cleared icon to
            reconcile
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {transactionsEditable && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 10,
                  backgroundColor: 'var(--surface-container)',
                  border: '1px solid var(--outline-variant)',
                  fontSize: 12
                }}
                title="Default date retained across new transactions in this session for fast reconciliation"
              >
                <span style={{ color: 'var(--on-surface-variant)', fontWeight: 600 }}>
                  Session Date:
                </span>
                <input
                  type="date"
                  className="mono-num"
                  value={sessionLastTransactionDate}
                  onChange={(e) => setSessionLastTransactionDate(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--on-surface)',
                    fontWeight: 700,
                    fontSize: 12.5,
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenAdd}
              >
                <Plus size={16} />
                Add Transaction
              </button>
            </>
          )}
        </div>
      </div>

      {!transactionsEditable && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            backgroundColor: 'var(--surface-variant)',
            color: 'var(--on-surface-variant)',
            fontSize: 13
          }}
        >
          Transactions can only be added or modified in the <strong>Current</strong>{' '}
          cycle. Pick the Current cycle from the top menu or promote this cycle in
          Settings.
        </div>
      )}

      {/* Account Filter Carousel */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4
        }}
      >
        <button
          type="button"
          className={`chip ${selectedAccountId === null ? 'active' : ''}`}
          onClick={() => setSelectedAccountId(null)}
        >
          All Accounts
        </button>
        {activeAccounts.map((acc) => {
          const bal = balanceById.get(acc.id);
          return (
            <button
              key={acc.id}
              type="button"
              className={`chip ${selectedAccountId === acc.id ? 'active' : ''}`}
              onClick={() =>
                setSelectedAccountId((prev) => (prev === acc.id ? null : acc.id))
              }
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: acc.colorHex
                }}
              />
              <span>{acc.name}</span>
              <span className="mono-num" style={{ opacity: 0.85 }}>
                {Money.format(bal?.currentBalance ?? 0)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Account Balance Breakdown Banner */}
      {selectedAccountDetail && (
        <div className="card" style={{ padding: '14px 18px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                {selectedAccountDetail.account.name} · Reconciliation Summary
              </div>
              <div
                className="mono-num"
                style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}
              >
                {Money.format(selectedAccountDetail.availableBalance)}{' '}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--on-surface-variant)'
                  }}
                >
                  Available
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--on-surface-variant)', fontSize: 11.5 }}>
                  Cleared Balance
                </div>
                <strong className="mono-num">
                  {Money.format(selectedAccountDetail.clearedBalance)}
                </strong>
              </div>
              <div>
                <div style={{ color: 'var(--on-surface-variant)', fontSize: 11.5 }}>
                  Pending / Uncleared
                </div>
                <strong className="mono-num">
                  {Money.format(selectedAccountDetail.unclearedDelta)}
                </strong>
              </div>
              <div>
                <div style={{ color: 'var(--on-surface-variant)', fontSize: 11.5 }}>
                  Current Total
                </div>
                <strong className="mono-num">
                  {Money.format(selectedAccountDetail.currentBalance)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Strip */}
      <div
        className="card"
        style={{
          padding: 14,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--on-surface-variant)'
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Search payee, category, note, tag, or amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Type Filter Chips */}
        {(
          [
            ['ALL', 'All Types'],
            [TransactionType.EXPENSE, 'Expense'],
            [TransactionType.INCOME, 'Income'],
            [TransactionType.TRANSFER, 'Transfer']
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            className={`chip ${selectedType === val ? 'active' : ''}`}
            onClick={() => setSelectedType(val)}
          >
            {label}
          </button>
        ))}

        {/* Cleared Filter */}
        <select
          className="select"
          style={{ width: 'auto' }}
          value={clearedFilter}
          onChange={(e) => setClearedFilter(e.target.value as ClearedFilter)}
        >
          <option value="ALL">All Statuses</option>
          <option value="CLEARED">Cleared Only</option>
          <option value="UNCLEARED">Pending / Uncleared Only</option>
        </select>

        {/* Category Filter */}
        <select
          className="select"
          style={{ width: 'auto' }}
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {snapshot.categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Transactions List Grouped by Date */}
      {groupedByDate.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 42 }}>
          <Receipt
            size={36}
            style={{ color: 'var(--primary)', marginBottom: 8 }}
          />
          <h3 style={{ margin: '0 0 6px 0' }}>No Matching Transactions</h3>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: 13.5 }}>
            {periodTransactions.length === 0
              ? 'Record your first expense, income, or transfer in this budget cycle.'
              : 'Try clearing your search or filter criteria.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupedByDate.map((group) => (
            <div key={group.date} className="card" style={{ padding: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--on-surface-variant)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 8,
                  paddingBottom: 6,
                  borderBottom: '1px solid var(--outline-variant)'
                }}
              >
                {group.date}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map((tx) => {
                  const isCover = EnvelopeCoverage.isCoverTransfer(tx);
                  const isIncome = tx.type === TransactionType.INCOME;
                  const isTransfer = tx.type === TransactionType.TRANSFER;
                  const color = isIncome
                    ? 'var(--income)'
                    : isTransfer
                    ? 'var(--transfer)'
                    : 'var(--expense)';
                  const prefix = isIncome ? '+' : isTransfer ? '⇄ ' : '-';

                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 10px',
                        borderRadius: 10,
                        backgroundColor: 'var(--surface-container)',
                        gap: 10,
                        flexWrap: 'wrap'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flex: 1,
                          minWidth: 220
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => void toggleTransactionCleared(tx.id)}
                          disabled={!transactionsEditable}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 2,
                            cursor: transactionsEditable ? 'pointer' : 'default',
                            color: tx.cleared
                              ? 'var(--income)'
                              : 'var(--on-surface-variant)'
                          }}
                          title={
                            tx.cleared
                              ? 'Cleared (click to mark pending)'
                              : 'Pending (click to mark cleared)'
                          }
                        >
                          {tx.cleared ? (
                            <CheckCircle2 size={18} />
                          ) : (
                            <Circle size={18} />
                          )}
                        </button>

                        <div
                          onClick={() =>
                            transactionsEditable && handleOpenEdit(tx)
                          }
                          style={{
                            cursor: transactionsEditable ? 'pointer' : 'default',
                            flex: 1
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexWrap: 'wrap'
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 14 }}>
                              {tx.payee ||
                                tx.category ||
                                (isTransfer
                                  ? `${tx.accountName} → ${tx.toAccountName}`
                                  : 'Transaction')}
                            </span>
                            {isCover && (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: 'var(--primary-container)',
                                  color: 'var(--on-primary-container)',
                                  fontSize: 10.5
                                }}
                              >
                                <ShieldCheck size={11} />
                                Covered: {tx.category}
                              </span>
                            )}
                            {tx.tag && !isCover && (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: 'var(--surface-variant)',
                                  color: 'var(--on-surface-variant)',
                                  fontSize: 10.5
                                }}
                              >
                                #{tx.tag}
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--on-surface-variant)',
                              marginTop: 2
                            }}
                          >
                            {isTransfer
                              ? `Transfer: ${tx.accountName} → ${tx.toAccountName}`
                              : `${tx.category || 'Uncategorized'}${
                                  tx.subCategory ? ` · ${tx.subCategory}` : ''
                                } · ${tx.accountName}`}
                            {tx.note && ` — ${tx.note}`}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <div
                          className="mono-num"
                          style={{
                            fontWeight: 700,
                            fontSize: 14.5,
                            color,
                            marginRight: 6
                          }}
                        >
                          {prefix}
                          {Money.format(tx.amount)}
                        </div>

                        {transactionsEditable && (
                          <>
                            {!isCover && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '4px 7px' }}
                                onClick={() => handleOpenDuplicate(tx)}
                                title="Duplicate transaction (uses current session date)"
                              >
                                <Copy size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '4px 7px' }}
                              onClick={() => handleOpenEdit(tx)}
                              title={isCover ? 'Inspect cover transfer' : 'Edit'}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{
                                padding: '4px 7px',
                                color: 'var(--expense)'
                              }}
                              onClick={() => void deleteTransaction(tx.id)}
                              title="Delete transaction"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit / Duplicate Modal */}
      <TransactionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialTransaction={editingTx}
        isDuplicate={isDuplicating}
        defaultAccountId={selectedAccountId}
      />

      {/* Cover Transfer Summary & Undo Dialog */}
      {inspectingCover && (
        <div
          className="modal-backdrop"
          onClick={() => setInspectingCover(null)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 440 }}
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
                Envelope Cover Transfer
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setInspectingCover(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)' }}>
              <strong>{Money.format(inspectingCover.amount)}</strong> transferred
              from <strong>{inspectingCover.envelopeName}</strong> to{' '}
              <strong>{inspectingCover.destinationName}</strong> on{' '}
              {inspectingCover.date} to cover{' '}
              <strong>
                {inspectingCover.category}
                {inspectingCover.subCategory
                  ? ` · ${inspectingCover.subCategory}`
                  : ''}
              </strong>
              .
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setInspectingCover(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  await undoCoverTransfer(inspectingCover.transactionId);
                  setInspectingCover(null);
                }}
              >
                <RotateCcw size={15} />
                Undo Cover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
