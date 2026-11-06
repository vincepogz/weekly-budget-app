import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  PiggyBank,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react';
import {
  AccountType,
  BUDGET_TOTAL_MODE_META,
  BudgetFrequency,
  BudgetTotalMode,
  TransactionType,
  isDebtAccountType
} from '../domain/models';
import { CyclePlan, Money } from '../domain/cents';
import { getTargetProgress } from '../domain/transactionLogic';
import { useBudget } from '../state/BudgetContext';
import { TransactionModal } from '../components/TransactionModal';

export const DashboardScreen: React.FC<{
  onNavigateTab: (tabIndex: number, accountId?: string | null) => void;
}> = ({ onNavigateTab }) => {
  const {
    settings,
    selectedPeriod,
    computedCurrentWeek,
    computedYearProgress,
    transactionsEditable,
    accountBalances,
    totalWeeklyIncome,
    totalWeeklyBudget,
    remainingWeeklyAfterBudget,
    totalAllocatedWeekly,
    periodTransactions,
    budgetProgress,
    setBudgetTotalMode
  } = useBudget();

  const [addTxOpen, setAddTxOpen] = useState(false);

  const mode = settings.budgetTotalMode;
  const weeks = selectedPeriod?.numberOfWeeks ?? 52;

  const displayIncome = CyclePlan.weeklyToMode(totalWeeklyIncome, mode, weeks);
  const displayBudget = CyclePlan.weeklyToMode(totalWeeklyBudget, mode, weeks);
  const displayRemaining = CyclePlan.weeklyToMode(
    remainingWeeklyAfterBudget,
    mode,
    weeks
  );
  const displayAllocated = CyclePlan.weeklyToMode(totalAllocatedWeekly, mode, weeks);

  const cashAccounts = accountBalances.filter(
    (b) =>
      !b.account.isArchived &&
      (b.account.type === AccountType.CHECKING ||
        b.account.type === AccountType.SAVINGS ||
        b.account.type === AccountType.OTHER)
  );
  const envelopeAccounts = accountBalances.filter(
    (b) => !b.account.isArchived && b.account.type === AccountType.ENVELOPE
  );
  const debtAccounts = accountBalances.filter(
    (b) => !b.account.isArchived && isDebtAccountType(b.account.type)
  );

  const totalCashAvailable = cashAccounts.reduce(
    (sum, b) => sum + b.availableBalance,
    0
  );
  const totalEnvelopesSaved = envelopeAccounts.reduce(
    (sum, b) => sum + b.currentBalance,
    0
  );
  const totalDebtBalance = debtAccounts.reduce(
    (sum, b) => sum + b.currentBalance,
    0
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Hero Cash Flow & Cycle Progress Card */}
      <div className="hero-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 16
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                opacity: 0.85
              }}
            >
              {selectedPeriod?.name ?? 'Active Budget'} ·{' '}
              {BUDGET_TOTAL_MODE_META[mode].badgeText}
            </div>
            <div
              className="mono-num"
              style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}
            >
              {Money.format(displayRemaining)}
            </div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              {displayRemaining >= 0
                ? 'Remaining unbudgeted income'
                : 'Over-budgeted deficit'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {Object.values(BudgetTotalMode).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void setBudgetTotalMode(m)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.3)',
                  backgroundColor:
                    mode === m ? '#ffffff' : 'rgba(255,255,255,0.12)',
                  color: mode === m ? '#0f172a' : '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {BUDGET_TOTAL_MODE_META[m].label}
              </button>
            ))}

            {transactionsEditable && (
              <button
                type="button"
                onClick={() => setAddTxOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginLeft: 4
                }}
              >
                <Plus size={16} />
                Add Transaction
              </button>
            )}
          </div>
        </div>

        {/* Hero KPIs */}
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '11px 14px'
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.85 }}>Planned Income</div>
            <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {Money.format(displayIncome)}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '11px 14px'
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.85 }}>Planned Budget</div>
            <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {Money.format(displayBudget)}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '11px 14px'
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.85 }}>Account Contributions</div>
            <div className="mono-num" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
              {Money.format(displayAllocated)}
            </div>
          </div>
        </div>

        {/* Cycle Progress Bar */}
        {selectedPeriod && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                opacity: 0.9,
                marginBottom: 6
              }}
            >
              <span>
                Cycle Progress: Week {computedCurrentWeek} of{' '}
                {selectedPeriod.numberOfWeeks}
              </span>
              <span className="mono-num">
                {Math.round(computedYearProgress * 100)}%
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 7,
                backgroundColor: 'rgba(255,255,255,0.22)',
                borderRadius: 999,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(2, computedYearProgress * 100))}%`,
                  height: '100%',
                  backgroundColor: '#ffffff',
                  borderRadius: 999
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Actual Cycle Cash Flow Strip */}
      <div className="grid-3">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
              color: 'var(--income)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <TrendingUp size={20} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              Actual Cycle Income
            </div>
            <div className="mono-num" style={{ fontSize: 18, fontWeight: 700 }}>
              {Money.format(budgetProgress.totalActualIncome)}
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: 'rgba(239, 68, 68, 0.14)',
              color: 'var(--expense)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <TrendingDown size={20} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              Actual Cycle Spending
            </div>
            <div className="mono-num" style={{ fontSize: 18, fontWeight: 700 }}>
              {Money.format(budgetProgress.totalActualSpent)}
            </div>
            {budgetProgress.totalCoveredFromEnvelope > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--primary)' }}>
                {Money.format(budgetProgress.totalCoveredFromEnvelope)} covered from
                envelopes
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: 'var(--primary-container)',
              color: 'var(--on-primary-container)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Wallet size={20} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              Available Cash (Excl. Envelopes)
            </div>
            <div className="mono-num" style={{ fontSize: 18, fontWeight: 700 }}>
              {Money.format(totalCashAvailable)}
            </div>
          </div>
        </div>
      </div>

      {/* Accounts & Envelopes Grid */}
      <div className="grid-2">
        {/* Checking & Savings */}
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
              <Wallet size={18} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>
                Checking &amp; Savings
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 8px', fontSize: 12 }}
              onClick={() => onNavigateTab(4)}
            >
              Manage
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cashAccounts.map((detail) => (
              <div
                key={detail.account.id}
                onClick={() => onNavigateTab(3, detail.account.id)}
                style={{
                  padding: '11px 13px',
                  borderRadius: 12,
                  backgroundColor: 'var(--surface-container)',
                  border: '1px solid var(--outline-variant)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: detail.account.colorHex
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {detail.account.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>
                      Cleared: {Money.format(detail.clearedBalance)}
                      {detail.allocatedToEnvelopes > 0 &&
                        ` · Envelopes: ${Money.format(detail.allocatedToEnvelopes)}`}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    className="mono-num"
                    style={{
                      fontWeight: 700,
                      fontSize: 14.5,
                      color: detail.isOverdrawn
                        ? 'var(--expense)'
                        : 'var(--on-surface)'
                    }}
                  >
                    {Money.format(detail.availableBalance)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>
                    Available
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Envelopes (Sinking Funds) & Debt */}
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
              <PiggyBank size={18} style={{ color: 'var(--secondary)' }} />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>
                Envelopes &amp; Cards ({Money.format(totalEnvelopesSaved)} saved)
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 8px', fontSize: 12 }}
              onClick={() => onNavigateTab(4)}
            >
              Manage
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {envelopeAccounts.map((detail) => {
              const progress = getTargetProgress(detail);
              return (
                <div
                  key={detail.account.id}
                  onClick={() => onNavigateTab(3, detail.account.id)}
                  style={{
                    padding: '11px 13px',
                    borderRadius: 12,
                    backgroundColor: 'var(--surface-container)',
                    border: '1px solid var(--outline-variant)',
                    cursor: 'pointer'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: detail.account.targetAmount > 0 ? 6 : 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: detail.account.colorHex
                        }}
                      />
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {detail.account.name}
                      </span>
                    </div>
                    <div className="mono-num" style={{ fontWeight: 700, fontSize: 14 }}>
                      {Money.format(detail.currentBalance)}
                      {detail.account.targetAmount > 0 && (
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: 'var(--on-surface-variant)'
                          }}
                        >
                          {' '}
                          / {Money.format(detail.account.targetAmount)}
                        </span>
                      )}
                    </div>
                  </div>
                  {detail.account.targetAmount > 0 && (
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.round(progress * 100)}%`,
                          backgroundColor: detail.account.colorHex || 'var(--primary)'
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {debtAccounts.map((detail) => (
              <div
                key={detail.account.id}
                onClick={() => onNavigateTab(3, detail.account.id)}
                style={{
                  padding: '11px 13px',
                  borderRadius: 12,
                  backgroundColor: 'var(--surface-container)',
                  border: '1px solid var(--outline-variant)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={15} style={{ color: 'var(--warning)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {detail.account.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>
                      {detail.account.type === AccountType.CREDIT_CARD
                        ? 'Credit Card'
                        : 'Loan'}
                      {totalDebtBalance > 0 ? '' : ''}
                    </div>
                  </div>
                </div>
                <div
                  className="mono-num"
                  style={{ fontWeight: 700, fontSize: 14, color: 'var(--on-surface)' }}
                >
                  {Money.format(detail.currentBalance)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Budget Progress & Recent Transactions */}
      <div className="grid-2">
        {/* Top Budget Categories */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12
            }}
          >
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>
              Budget Progress (Cycle)
            </h3>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 8px', fontSize: 12 }}
              onClick={() => onNavigateTab(1)}
            >
              Open Budget <ArrowRight size={14} />
            </button>
          </div>

          {budgetProgress.byCategory.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--on-surface-variant)',
                fontSize: 13.5
              }}
            >
              No budget items yet. Go to the <strong>Budget</strong> tab to plan your
              categories.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {budgetProgress.byCategory.slice(0, 6).map((cat) => {
                const pct = Math.min(100, Math.round(cat.utilizationRatio * 100));
                return (
                  <div key={cat.category}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        marginBottom: 4
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{cat.category}</span>
                      <span className="mono-num" style={{ fontSize: 12.5 }}>
                        {Money.format(cat.netOutOfBudget)} /{' '}
                        {Money.format(cat.plannedCycle)}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: cat.isOverBudget
                            ? 'var(--expense)'
                            : pct > 85
                            ? 'var(--warning)'
                            : 'var(--primary)'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
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
              <Receipt size={18} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>
                Recent Transactions
              </h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 8px', fontSize: 12 }}
              onClick={() => onNavigateTab(3)}
            >
              View Ledger <ArrowUpRight size={14} />
            </button>
          </div>

          {periodTransactions.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--on-surface-variant)',
                fontSize: 13.5
              }}
            >
              No transactions recorded in this cycle yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {periodTransactions.slice(0, 6).map((tx) => {
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
                    onClick={() => onNavigateTab(3)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 10,
                      backgroundColor: 'var(--surface-container)',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {tx.payee || tx.category || tx.note || 'Transaction'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--on-surface-variant)' }}>
                        {tx.date} ·{' '}
                        {isTransfer
                          ? `${tx.accountName} → ${tx.toAccountName}`
                          : `${tx.category || 'Uncategorized'} · ${tx.accountName}`}
                      </div>
                    </div>
                    <div
                      className="mono-num"
                      style={{ fontWeight: 700, fontSize: 13.5, color }}
                    >
                      {prefix}
                      {Money.format(tx.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TransactionModal isOpen={addTxOpen} onClose={() => setAddTxOpen(false)} />
    </div>
  );
};
