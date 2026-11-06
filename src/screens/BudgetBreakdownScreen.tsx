import React, { useMemo, useState } from 'react';
import {
  Copy,
  Edit3,
  Layers,
  PiggyBank,
  Plus,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import {
  AccountType,
  BUDGET_FREQUENCY_META,
  BUDGET_TOTAL_MODE_META,
  BudgetFrequency,
  BudgetItem,
  BudgetTotalMode,
  ExpenseType,
  PercentageBasis,
  TransactionType
} from '../domain/models';
import { BudgetFrequencyMath, CentsMath, CyclePlan, Money } from '../domain/cents';
import { todayIso } from '../domain/localDate';
import { PickerLogic } from '../domain/displayName';
import { EnvelopeCoverage } from '../domain/envelopeCoverage';
import { useBudget } from '../state/BudgetContext';

export const BudgetBreakdownScreen: React.FC = () => {
  const {
    snapshot,
    settings,
    selectedPeriod,
    activeAccounts,
    balanceById,
    periodBudgetItems,
    periodTransactions,
    totalWeeklyIncome,
    totalWeeklyBudget,
    remainingWeeklyAfterBudget,
    coveredByLineInSelectedCycle,
    setBudgetTotalMode,
    setPercentageBasis,
    saveBudgetItem,
    deleteBudgetItem,
    recordCoverFromEnvelope,
    copyBudgetBetweenCycles
  } = useBudget();

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);

  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [coverCategory, setCoverCategory] = useState('');
  const [coverSubCategory, setCoverSubCategory] = useState('');
  const [coverEnvelopeId, setCoverEnvelopeId] = useState('');
  const [coverDestAccountId, setCoverDestAccountId] = useState('');
  const [coverAmountInput, setCoverAmountInput] = useState('');
  const [coverDate, setCoverDate] = useState(todayIso());
  const [coverNote, setCoverNote] = useState('');

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourcePeriodId, setCopySourcePeriodId] = useState('');
  const [copyReplaceExisting, setCopyReplaceExisting] = useState(false);

  // Add/Edit Budget Item Form State
  const [formCategory, setFormCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formAmountInput, setFormAmountInput] = useState('');
  const [formFrequency, setFormFrequency] = useState<BudgetFrequency>(
    BudgetFrequency.MONTHLY
  );
  const [formExpenseType, setFormExpenseType] = useState<ExpenseType>(
    ExpenseType.FIXED
  );
  const [formTargetAccountId, setFormTargetAccountId] = useState('');

  const mode = settings.budgetTotalMode;
  const basis = settings.percentageBasis;
  const weeks = selectedPeriod?.numberOfWeeks ?? 52;

  const displayIncome = CyclePlan.weeklyToMode(totalWeeklyIncome, mode, weeks);
  const displayBudget = CyclePlan.weeklyToMode(totalWeeklyBudget, mode, weeks);
  const displayRemaining = CyclePlan.weeklyToMode(
    remainingWeeklyAfterBudget,
    mode,
    weeks
  );

  const fixedWeeklySum = useMemo(
    () =>
      periodBudgetItems
        .filter((b) => b.expenseType === ExpenseType.FIXED)
        .reduce((acc, b) => acc + BudgetFrequencyMath.toWeekly(b.amount, b.frequency), 0),
    [periodBudgetItems]
  );
  const variableWeeklySum = totalWeeklyBudget - fixedWeeklySum;

  // Actual spending per category & subcategory
  const actualSpentByLine = useMemo(() => {
    const byLine = new Map<string, number>();
    const byCat = new Map<string, number>();
    for (const tx of periodTransactions) {
      if (tx.type !== TransactionType.EXPENSE) continue;
      const cKey = tx.category.trim().toLowerCase();
      const sKey = tx.subCategory.trim().toLowerCase();
      byLine.set(`${cKey}||${sKey}`, (byLine.get(`${cKey}||${sKey}`) ?? 0) + tx.amount);
      byCat.set(cKey, (byCat.get(cKey) ?? 0) + tx.amount);
    }
    return { byLine, byCat };
  }, [periodTransactions]);

  // Group budget items by category
  const groupedCategories = useMemo(() => {
    const map = new Map<
      string,
      { displayName: string; colorHex: string; items: BudgetItem[] }
    >();
    const catColors = new Map(
      snapshot.categories.map((c) => [c.name.trim().toLowerCase(), c.colorHex])
    );

    for (const item of periodBudgetItems) {
      const key = item.category.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(key, {
          displayName: item.category.trim(),
          colorHex: catColors.get(key) ?? '#2563EB',
          items: [item]
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const wA = a.items.reduce(
        (sum, x) => sum + BudgetFrequencyMath.toWeekly(x.amount, x.frequency),
        0
      );
      const wB = b.items.reduce(
        (sum, x) => sum + BudgetFrequencyMath.toWeekly(x.amount, x.frequency),
        0
      );
      return wB - wA;
    });
  }, [periodBudgetItems, snapshot.categories]);

  const openAddBudgetModal = (prefillCategory = '') => {
    setEditingItem(null);
    setFormCategory(prefillCategory || snapshot.categories[0]?.name || '');
    setFormSubCategory('');
    setFormAmountInput('');
    setFormFrequency(BudgetFrequency.MONTHLY);
    setFormExpenseType(ExpenseType.FIXED);
    setFormTargetAccountId('');
    setItemModalOpen(true);
  };

  const openEditBudgetModal = (item: BudgetItem) => {
    setEditingItem(item);
    setFormCategory(item.category);
    setFormSubCategory(item.subCategory);
    setFormAmountInput(CentsMath.toPlain(item.amount));
    setFormFrequency(item.frequency);
    setFormExpenseType(item.expenseType);
    setFormTargetAccountId(item.targetAccountId ?? '');
    setItemModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriod) return;
    const cents = CentsMath.parse(formAmountInput);
    if (!formCategory.trim() || cents <= 0) return;

    await saveBudgetItem({
      id: editingItem?.id,
      budgetPeriodId: selectedPeriod.id,
      category: formCategory.trim(),
      subCategory: formSubCategory.trim(),
      amount: cents,
      frequency: formFrequency,
      expenseType: formExpenseType,
      targetAccountId: formTargetAccountId || null
    });
    setItemModalOpen(false);
  };

  const openCoverModal = (item?: BudgetItem) => {
    const envelopes = activeAccounts.filter((a) => a.type === AccountType.ENVELOPE);
    const nonEnvelopes = activeAccounts.filter((a) => a.type !== AccountType.ENVELOPE);
    setCoverCategory(item?.category ?? groupedCategories[0]?.displayName ?? '');
    setCoverSubCategory(item?.subCategory ?? '');
    setCoverEnvelopeId(
      item?.targetAccountId &&
        envelopes.some((e) => e.id === item.targetAccountId)
        ? item.targetAccountId
        : envelopes[0]?.id ?? ''
    );
    setCoverDestAccountId(nonEnvelopes[0]?.id ?? '');
    setCoverAmountInput('');
    setCoverDate(todayIso());
    setCoverNote('');
    setCoverModalOpen(true);
  };

  const handleConfirmCover = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = CentsMath.parse(coverAmountInput);
    if (cents <= 0 || !coverEnvelopeId || !coverDestAccountId || !coverCategory) return;
    await recordCoverFromEnvelope({
      envelopeAccountId: coverEnvelopeId,
      destinationAccountId: coverDestAccountId,
      category: coverCategory,
      subCategory: coverSubCategory,
      amount: cents,
      date: coverDate,
      note: coverNote
    });
    setCoverModalOpen(false);
  };

  const denominatorWeekly =
    basis === PercentageBasis.INCOME ? totalWeeklyIncome : totalWeeklyBudget;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header & Controls */}
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
            Budget Breakdown · {BUDGET_TOTAL_MODE_META[mode].badgeText}
          </h2>
          <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
            Plan fixed &amp; variable spending and cover irregular expenses from
            envelopes
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Mode Switcher */}
          {Object.values(BudgetTotalMode).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${mode === m ? 'active' : ''}`}
              onClick={() => void setBudgetTotalMode(m)}
            >
              {BUDGET_TOTAL_MODE_META[m].label}
            </button>
          ))}

          {/* Percentage Basis Toggle */}
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '6px 11px', fontSize: 12 }}
            onClick={() =>
              void setPercentageBasis(
                basis === PercentageBasis.INCOME
                  ? PercentageBasis.TOTAL_BUDGET
                  : PercentageBasis.INCOME
              )
            }
          >
            {basis === PercentageBasis.INCOME ? '% of Income' : '% of Budget'}
          </button>

          {snapshot.periods.length > 1 && (
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '7px 12px', fontSize: 12.5 }}
              onClick={() => {
                const other = snapshot.periods.find(
                  (p) => p.id !== selectedPeriod?.id
                );
                setCopySourcePeriodId(other?.id ?? '');
                setCopyModalOpen(true);
              }}
            >
              <Copy size={14} />
              Copy Cycle Budget
            </button>
          )}

          <button
            type="button"
            className="btn btn-tonal"
            style={{ padding: '7px 12px', fontSize: 12.5 }}
            onClick={() => openCoverModal()}
          >
            <ShieldCheck size={15} />
            Cover Spending
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openAddBudgetModal()}
          >
            <Plus size={16} />
            Add Budget Line
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid-3">
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Total Planned ({BUDGET_TOTAL_MODE_META[mode].label})
          </div>
          <div className="mono-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
            {Money.format(displayBudget)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            Fixed:{' '}
            {Money.format(CyclePlan.weeklyToMode(fixedWeeklySum, mode, weeks))} · Variable:{' '}
            {Money.format(CyclePlan.weeklyToMode(variableWeeklySum, mode, weeks))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Planned Income ({BUDGET_TOTAL_MODE_META[mode].label})
          </div>
          <div
            className="mono-num"
            style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: 'var(--income)' }}
          >
            {Money.format(displayIncome)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            {totalWeeklyIncome > 0
              ? `${CentsMath.percentOf(totalWeeklyBudget, totalWeeklyIncome).toFixed(1)}% of income budgeted`
              : 'Set income in Cash Flow tab'}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Remaining Unbudgeted ({BUDGET_TOTAL_MODE_META[mode].label})
          </div>
          <div
            className="mono-num"
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginTop: 4,
              color: displayRemaining >= 0 ? 'var(--primary)' : 'var(--expense)'
            }}
          >
            {Money.format(displayRemaining)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            {displayRemaining >= 0 ? 'Available to allocate' : 'Exceeds planned income'}
          </div>
        </div>
      </div>

      {/* Category Cards */}
      {groupedCategories.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Layers
            size={36}
            style={{ color: 'var(--primary)', marginBottom: 8 }}
          />
          <h3 style={{ margin: '0 0 6px 0' }}>No Budget Lines in This Cycle</h3>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: 13.5 }}>
            Add your fixed bills and variable spending categories, or copy from another
            budget cycle.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openAddBudgetModal()}
          >
            <Plus size={16} />
            Add First Budget Line
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groupedCategories.map((group) => {
            const catWeekly = group.items.reduce(
              (sum, i) => sum + BudgetFrequencyMath.toWeekly(i.amount, i.frequency),
              0
            );
            const catDisplay = CyclePlan.weeklyToMode(catWeekly, mode, weeks);
            const pct = CentsMath.percentOf(catWeekly, denominatorWeekly);

            return (
              <div key={group.displayName} className="card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                    gap: 10,
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 4,
                        backgroundColor: group.colorHex
                      }}
                    />
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                      {group.displayName}
                    </h3>
                    <span
                      className="badge mono-num"
                      style={{
                        backgroundColor: 'var(--surface-variant)',
                        color: 'var(--on-surface-variant)'
                      }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="mono-num" style={{ fontWeight: 800, fontSize: 16 }}>
                      {Money.format(catDisplay)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      onClick={() => openAddBudgetModal(group.displayName)}
                    >
                      <Plus size={14} /> Line
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map((item) => {
                    const itemDisplay = CyclePlan.amountForMode(
                      item.amount,
                      item.frequency,
                      mode,
                      weeks
                    );
                    const itemCycleTotal = CyclePlan.cycleTotal(
                      item.amount,
                      item.frequency,
                      weeks
                    );
                    const cKey = item.category.trim().toLowerCase();
                    const sKey = item.subCategory.trim().toLowerCase();
                    const actualLineSpent =
                      sKey.length > 0
                        ? actualSpentByLine.byLine.get(`${cKey}||${sKey}`) ?? 0
                        : actualSpentByLine.byCat.get(cKey) ?? 0;
                    const covered = EnvelopeCoverage.coveredForBudgetItem(
                      item,
                      coveredByLineInSelectedCycle,
                      group.items.length
                    );
                    const netSpent = Math.max(0, actualLineSpent - covered);
                    const targetAcc = item.targetAccountId
                      ? activeAccounts.find((a) => a.id === item.targetAccountId)
                      : null;

                    return (
                      <div
                        key={item.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 12,
                          backgroundColor: 'var(--surface-container)',
                          border: '1px solid var(--outline-variant)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>
                              {item.subCategory || item.category}
                            </span>
                            <span
                              className="badge"
                              style={{
                                backgroundColor:
                                  item.expenseType === ExpenseType.FIXED
                                    ? 'var(--primary-container)'
                                    : 'var(--secondary-container)',
                                color:
                                  item.expenseType === ExpenseType.FIXED
                                    ? 'var(--on-primary-container)'
                                    : 'var(--secondary)',
                                fontSize: 10.5
                              }}
                            >
                              {item.expenseType === ExpenseType.FIXED
                                ? 'Fixed'
                                : 'Variable'}
                            </span>
                            {targetAcc && (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: 'var(--surface-variant)',
                                  color: 'var(--on-surface-variant)',
                                  fontSize: 10.5
                                }}
                              >
                                <PiggyBank size={11} />
                                {targetAcc.name}
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--on-surface-variant)',
                              marginTop: 3
                            }}
                          >
                            Entered: {Money.format(item.amount)}
                            {BUDGET_FREQUENCY_META[item.frequency].shortLabel} · Cycle
                            spent: {Money.format(netSpent)} /{' '}
                            {Money.format(itemCycleTotal)}
                            {covered > 0 &&
                              ` (${Money.format(covered)} covered from envelope)`}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}
                        >
                          <div
                            className="mono-num"
                            style={{ fontWeight: 700, fontSize: 14.5 }}
                          >
                            {Money.format(itemDisplay)}
                          </div>

                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '5px 8px', fontSize: 12 }}
                            onClick={() => openCoverModal(item)}
                            title="Cover spending from envelope"
                          >
                            <ShieldCheck size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '5px 8px' }}
                            onClick={() => openEditBudgetModal(item)}
                            title="Edit budget line"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '5px 8px', color: 'var(--expense)' }}
                            onClick={() => void deleteBudgetItem(item.id)}
                            title="Delete budget line"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Budget Item Modal */}
      {itemModalOpen && (
        <div className="modal-backdrop" onClick={() => setItemModalOpen(false)}>
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
                marginBottom: 14
              }}
            >
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                {editingItem ? 'Edit Budget Line' : 'Add Budget Line'}
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setItemModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveItem}
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
                    Category
                  </label>
                  <input
                    className="input"
                    list="wb-budget-cats"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Housing, Groceries"
                    required
                  />
                  <datalist id="wb-budget-cats">
                    {snapshot.categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
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
                    Sub-Category (optional)
                  </label>
                  <input
                    className="input"
                    list="wb-budget-subcats"
                    value={formSubCategory}
                    onChange={(e) => setFormSubCategory(e.target.value)}
                    placeholder="e.g. Rent, Electric"
                  />
                  <datalist id="wb-budget-subcats">
                    {PickerLogic.subCategoriesForCategory(
                      formCategory,
                      snapshot.categories
                    ).map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
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
                    value={formAmountInput}
                    onChange={(e) => setFormAmountInput(e.target.value)}
                    placeholder="0.00"
                    required
                    autoFocus
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
                    value={formFrequency}
                    onChange={(e) =>
                      setFormFrequency(e.target.value as BudgetFrequency)
                    }
                  >
                    {Object.values(BudgetFrequency).map((f) => (
                      <option key={f} value={f}>
                        {BUDGET_FREQUENCY_META[f].label}
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
                    Expense Type
                  </label>
                  <select
                    className="select"
                    value={formExpenseType}
                    onChange={(e) =>
                      setFormExpenseType(e.target.value as ExpenseType)
                    }
                  >
                    <option value={ExpenseType.FIXED}>Fixed</option>
                    <option value={ExpenseType.VARIABLE}>Variable</option>
                  </select>
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
                    Target Account / Envelope (optional)
                  </label>
                  <select
                    className="select"
                    value={formTargetAccountId}
                    onChange={(e) => setFormTargetAccountId(e.target.value)}
                  >
                    <option value="">None</option>
                    {activeAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 8
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setItemModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Budget Line
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cover Spending from Envelope Modal */}
      {coverModalOpen && (
        <div className="modal-backdrop" onClick={() => setCoverModalOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 500 }}
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
                Cover Spending from Envelope
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setCoverModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p
              style={{
                fontSize: 13,
                color: 'var(--on-surface-variant)',
                marginTop: 0
              }}
            >
              Creates a tagged <code>cover</code> transfer from an Envelope (sinking
              fund) to your payment account, offsetting out-of-budget spending for
              the category.
            </p>

            <form
              onSubmit={handleConfirmCover}
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
                    From Envelope
                  </label>
                  <select
                    className="select"
                    value={coverEnvelopeId}
                    onChange={(e) => setCoverEnvelopeId(e.target.value)}
                    required
                  >
                    <option value="">Select envelope...</option>
                    {activeAccounts
                      .filter((a) => a.type === AccountType.ENVELOPE)
                      .map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name} (
                          {Money.format(
                            balanceById.get(env.id)?.currentBalance ?? 0
                          )}
                          )
                        </option>
                      ))}
                  </select>
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
                    To Account
                  </label>
                  <select
                    className="select"
                    value={coverDestAccountId}
                    onChange={(e) => setCoverDestAccountId(e.target.value)}
                    required
                  >
                    <option value="">Select destination...</option>
                    {activeAccounts
                      .filter((a) => a.id !== coverEnvelopeId)
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
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
                    Category to Cover
                  </label>
                  <input
                    className="input"
                    value={coverCategory}
                    onChange={(e) => setCoverCategory(e.target.value)}
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
                    Sub-Category (optional)
                  </label>
                  <input
                    className="input"
                    value={coverSubCategory}
                    onChange={(e) => setCoverSubCategory(e.target.value)}
                  />
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
                    Amount to Cover ($)
                  </label>
                  <input
                    className="input mono-num"
                    placeholder="0.00"
                    value={coverAmountInput}
                    onChange={(e) => setCoverAmountInput(e.target.value)}
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
                    Date
                  </label>
                  <input
                    type="date"
                    className="input mono-num"
                    value={coverDate}
                    onChange={(e) => setCoverDate(e.target.value)}
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
                  Note (optional)
                </label>
                <input
                  className="input"
                  value={coverNote}
                  onChange={(e) => setCoverNote(e.target.value)}
                  placeholder="Optional note..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCoverModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Record Cover Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Budget Between Cycles Modal */}
      {copyModalOpen && selectedPeriod && (
        <div className="modal-backdrop" onClick={() => setCopyModalOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: 17, fontWeight: 700 }}>
              Copy Budget Lines into &ldquo;{selectedPeriod.name}&rdquo;
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    marginBottom: 5
                  }}
                >
                  Source Cycle
                </label>
                <select
                  className="select"
                  value={copySourcePeriodId}
                  onChange={(e) => setCopySourcePeriodId(e.target.value)}
                >
                  {snapshot.periods
                    .filter((p) => p.id !== selectedPeriod.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.startDate} → {p.endDate})
                      </option>
                    ))}
                </select>
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
                  checked={copyReplaceExisting}
                  onChange={(e) => setCopyReplaceExisting(e.target.checked)}
                />
                Replace existing budget lines in {selectedPeriod.name}
              </label>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 8
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCopyModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!copySourcePeriodId}
                  onClick={async () => {
                    await copyBudgetBetweenCycles({
                      fromPeriodId: copySourcePeriodId,
                      toPeriodId: selectedPeriod.id,
                      replaceExisting: copyReplaceExisting
                    });
                    setCopyModalOpen(false);
                  }}
                >
                  Copy Budget
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
