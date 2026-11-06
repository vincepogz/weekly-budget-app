import React, { useState } from 'react';
import {
  Calculator,
  Edit3,
  Plus,
  Repeat,
  Trash2,
  Users,
  Wallet,
  X
} from 'lucide-react';
import {
  ALL_RECURRING_FREQUENCIES,
  BUDGET_FREQUENCY_META,
  BudgetFrequency,
  Cents,
  Contributor,
  IncomeCalculation,
  RECURRING_FREQUENCY_LABELS,
  RecurringFrequency
} from '../domain/models';
import { BudgetFrequencyMath, CentsMath, Money } from '../domain/cents';
import { todayIso } from '../domain/localDate';
import { ContributorAmounts } from '../domain/contributorAmounts';
import { useBudget } from '../state/BudgetContext';

export const ContributorsCashFlowScreen: React.FC = () => {
  const {
    snapshot,
    activeAccounts,
    periodContributors,
    periodIncomeSources,
    effectiveWeeklyIncomeByContributor,
    totalWeeklyIncome,
    periodAllocations,
    totalAllocatedWeekly,
    unallocatedWeeklyIncome,
    saveContributorWithDetails,
    deleteContributor,
    createOrUpdateRecurringFromAllocation,
    saveIncomeCalculation,
    deleteIncomeCalculation
  } = useBudget();

  const [displayFreq, setDisplayFreq] = useState<BudgetFrequency>(
    BudgetFrequency.MONTHLY
  );

  // Contributor Edit Modal State
  const [contributorModalOpen, setContributorModalOpen] = useState(false);
  const [editingContributor, setEditingContributor] =
    useState<Contributor | null>(null);
  const [cName, setCName] = useState('');
  const [cNote, setCNote] = useState('');
  const [cFallbackWeeklyInput, setCFallbackWeeklyInput] = useState('');
  const [cSources, setCSources] = useState<
    Array<{ id?: string; label: string; amountInput: string }>
  >([]);
  const [cAllocations, setCAllocations] = useState<
    Array<{ id?: string; accountId: string; amountInput: string }>
  >([]);

  // Recurring Contribution Dialog State
  const [schedTarget, setSchedTarget] = useState<{
    contributorName: string;
    accountId: string;
    weeklyAmount: Cents;
  } | null>(null);
  const [schedFrequency, setSchedFrequency] = useState<RecurringFrequency>(
    RecurringFrequency.WEEKLY
  );
  const [schedStartDate, setSchedStartDate] = useState(todayIso());

  // Income Calculator Modal State
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [editingCalc, setEditingCalc] = useState<IncomeCalculation | null>(null);
  const [calcContributorName, setCalcContributorName] = useState('You');
  const [calcSource, setCalcSource] = useState('Primary Job');
  const [calcHourlyInput, setCalcHourlyInput] = useState('35.00');
  const [calcHoursPerWeek, setCalcHoursPerWeek] = useState('40');
  const [calcWeeks, setCalcWeeks] = useState('52');
  const [calcTaxInput, setCalcTaxInput] = useState('250.00');
  const [calcInvestInput, setCalcInvestInput] = useState('150.00');

  const toDisplay = (weeklyCents: Cents): Cents =>
    BudgetFrequencyMath.fromWeekly(weeklyCents, displayFreq);

  const openContributorModal = (c?: Contributor) => {
    if (c) {
      setEditingContributor(c);
      setCName(c.name);
      setCNote(c.note);
      setCFallbackWeeklyInput(CentsMath.toPlain(c.weeklyAllowance));
      const sources = periodIncomeSources
        .filter((s) => s.contributorId === c.id)
        .map((s) => ({
          id: s.id,
          label: s.label,
          amountInput: CentsMath.toPlain(s.weeklyAmount)
        }));
      setCSources(
        sources.length > 0
          ? sources
          : [{ label: 'Primary Paycheck', amountInput: CentsMath.toPlain(c.weeklyAllowance) }]
      );
      const allocs = periodAllocations
        .filter((a) => a.contributorId === c.id)
        .map((a) => ({
          id: a.id,
          accountId: a.accountId,
          amountInput: CentsMath.toPlain(a.amount)
        }));
      setCAllocations(allocs);
    } else {
      setEditingContributor(null);
      setCName('');
      setCNote('');
      setCFallbackWeeklyInput('');
      setCSources([{ label: 'Primary Income', amountInput: '' }]);
      setCAllocations([]);
    }
    setContributorModalOpen(true);
  };

  const handleSaveContributor = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedSources = cSources
      .map((s) => ({
        id: s.id,
        label: s.label.trim(),
        weeklyAmount: CentsMath.parse(s.amountInput)
      }))
      .filter((s) => s.label.length > 0 || s.weeklyAmount > 0);

    const totalWeekly =
      parsedSources.length > 0
        ? parsedSources.reduce((sum, s) => sum + s.weeklyAmount, 0)
        : CentsMath.parse(cFallbackWeeklyInput);

    const parsedAllocs = cAllocations
      .map((a) => {
        const amt = CentsMath.parse(a.amountInput);
        const pct = totalWeekly > 0 ? (amt / totalWeekly) * 100.0 : 0;
        return {
          id: a.id,
          accountId: a.accountId,
          amount: amt,
          percentage: pct
        };
      })
      .filter((a) => a.accountId && a.amount > 0);

    await saveContributorWithDetails({
      id: editingContributor?.id,
      name: cName.trim() || 'Contributor',
      weeklyAllowance: totalWeekly,
      note: cNote,
      incomeSources: parsedSources,
      allocations: parsedAllocs
    });
    setContributorModalOpen(false);
  };

  const openCalcModal = (ic?: IncomeCalculation) => {
    if (ic) {
      setEditingCalc(ic);
      setCalcContributorName(ic.contributorName);
      setCalcSource(ic.source);
      setCalcHourlyInput(CentsMath.toPlain(ic.hourlyRate));
      setCalcHoursPerWeek(String(ic.hoursPerWeek));
      setCalcWeeks(String(ic.numberOfWeeks));
      setCalcTaxInput(CentsMath.toPlain(ic.weeklyTax));
      setCalcInvestInput(CentsMath.toPlain(ic.investment));
    } else {
      setEditingCalc(null);
      setCalcContributorName(periodContributors[0]?.name || 'You');
      setCalcSource('Salary / Hourly');
      setCalcHourlyInput('40.00');
      setCalcHoursPerWeek('40');
      setCalcWeeks('52');
      setCalcTaxInput('300.00');
      setCalcInvestInput('150.00');
    }
    setCalcModalOpen(true);
  };

  const handleSaveCalc = async (e: React.FormEvent) => {
    e.preventDefault();
    const hourly = CentsMath.parse(calcHourlyInput);
    const hours = Math.max(0, Number.parseFloat(calcHoursPerWeek) || 0);
    const weeksNum = Math.max(1, Number.parseInt(calcWeeks, 10) || 52);
    const weeklyGross = Math.round(hourly * hours);
    const yearlyGross = weeklyGross * weeksNum;
    const weeklyTax = CentsMath.parse(calcTaxInput);
    const investment = CentsMath.parse(calcInvestInput);
    const weeklyNet = Math.max(0, weeklyGross - weeklyTax - investment);

    await saveIncomeCalculation({
      id: editingCalc?.id,
      contributorName: calcContributorName.trim() || 'You',
      source: calcSource.trim() || 'Income',
      hourlyRate: hourly,
      hoursPerWeek: hours,
      numberOfWeeks: weeksNum,
      weeklyGross,
      yearlyGross,
      weeklyTax,
      investment,
      weeklyNet,
      reported: weeklyNet
    });
    setCalcModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header & Frequency Switcher */}
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
            Contributors &amp; Cash Flow · {BUDGET_FREQUENCY_META[displayFreq].label}
          </h2>
          <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
            Manage household contributors, multiple income streams, and account/envelope
            allocations
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.values(BudgetFrequency).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${displayFreq === f ? 'active' : ''}`}
              onClick={() => setDisplayFreq(f)}
            >
              {BUDGET_FREQUENCY_META[f].label}
            </button>
          ))}

          <button
            type="button"
            className="btn btn-tonal"
            onClick={() => openCalcModal()}
          >
            <Calculator size={15} />
            Income Calculator
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openContributorModal()}
          >
            <Plus size={16} />
            Add Contributor
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid-3">
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Total Household Income ({BUDGET_FREQUENCY_META[displayFreq].label})
          </div>
          <div
            className="mono-num"
            style={{ fontSize: 22, fontWeight: 800, color: 'var(--income)', marginTop: 4 }}
          >
            {Money.format(toDisplay(totalWeeklyIncome))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            Weekly base: {Money.format(totalWeeklyIncome)}/wk
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Allocated to Accounts &amp; Envelopes ({BUDGET_FREQUENCY_META[displayFreq].label})
          </div>
          <div className="mono-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
            {Money.format(toDisplay(totalAllocatedWeekly))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            {totalWeeklyIncome > 0
              ? `${CentsMath.percentOf(totalAllocatedWeekly, totalWeeklyIncome).toFixed(1)}% of income allocated`
              : 'No allocations yet'}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Unallocated Income ({BUDGET_FREQUENCY_META[displayFreq].label})
          </div>
          <div
            className="mono-num"
            style={{
              fontSize: 22,
              fontWeight: 800,
              marginTop: 4,
              color: unallocatedWeeklyIncome >= 0 ? 'var(--primary)' : 'var(--expense)'
            }}
          >
            {Money.format(toDisplay(unallocatedWeeklyIncome))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 4 }}>
            {unallocatedWeeklyIncome >= 0
              ? 'Remaining after account contributions'
              : 'Over-allocated vs weekly income'}
          </div>
        </div>
      </div>

      {/* Contributor Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {periodContributors.map((contributor) => {
          const effectiveWeekly =
            effectiveWeeklyIncomeByContributor.get(contributor.id) ??
            contributor.weeklyAllowance;
          const sources = periodIncomeSources.filter(
            (s) => s.contributorId === contributor.id
          );
          const allocs = periodAllocations.filter(
            (a) => a.contributorId === contributor.id
          );
          const allocSumWeekly = allocs.reduce((sum, a) => sum + a.amount, 0);
          const remainingInfo = ContributorAmounts.remainingAfterContributions(
            effectiveWeekly,
            allocSumWeekly
          );

          return (
            <div key={contributor.id} className="card">
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
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: 'var(--primary-container)',
                      color: 'var(--on-primary-container)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Users size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 700 }}>
                      {contributor.name}
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                      {contributor.note || 'Household contributor'} · Remaining:{' '}
                      <strong>
                        {Money.format(toDisplay(remainingInfo.remainingWeekly))}
                      </strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    className="mono-num"
                    style={{
                      fontWeight: 800,
                      fontSize: 18,
                      color: 'var(--income)'
                    }}
                  >
                    {Money.format(toDisplay(effectiveWeekly))}
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 500,
                        color: 'var(--on-surface-variant)'
                      }}
                    >
                      {BUDGET_FREQUENCY_META[displayFreq].shortLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '6px 10px', fontSize: 12.5 }}
                    onClick={() => openContributorModal(contributor)}
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                  {periodContributors.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '6px 8px', color: 'var(--expense)' }}
                      onClick={() => void deleteContributor(contributor.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid-2">
                {/* Income Sources */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: 'var(--surface-container)',
                    border: '1px solid var(--outline-variant)'
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--on-surface-variant)',
                      marginBottom: 8
                    }}
                  >
                    INCOME SOURCES
                  </div>
                  {sources.length === 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13.5
                      }}
                    >
                      <span>Base Allowance</span>
                      <strong className="mono-num">
                        {Money.format(toDisplay(contributor.weeklyAllowance))}
                      </strong>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sources.map((src) => (
                        <div
                          key={src.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 13.5
                          }}
                        >
                          <span>{src.label}</span>
                          <strong className="mono-num">
                            {Money.format(toDisplay(src.weeklyAmount))}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Account & Envelope Allocations */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: 'var(--surface-container)',
                    border: '1px solid var(--outline-variant)'
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--on-surface-variant)',
                      marginBottom: 8
                    }}
                  >
                    ACCOUNT &amp; ENVELOPE ALLOCATIONS
                  </div>
                  {allocs.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
                      No account allocations configured. Click Edit to assign weekly
                      deposits.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {allocs.map((al) => {
                        const acc = activeAccounts.find((a) => a.id === al.accountId);
                        return (
                          <div
                            key={al.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 13.5
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Wallet size={13} style={{ color: 'var(--primary)' }} />
                              <span>{acc?.name ?? 'Account'}</span>
                              <span
                                style={{
                                  fontSize: 11.5,
                                  color: 'var(--on-surface-variant)'
                                }}
                              >
                                ({al.percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong className="mono-num">
                                {Money.format(toDisplay(al.amount))}
                              </strong>
                              {acc && (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: '3px 6px', fontSize: 11 }}
                                  title="Schedule recurring deposit rule for this contribution"
                                  onClick={() => {
                                    setSchedTarget({
                                      contributorName: contributor.name,
                                      accountId: acc.id,
                                      weeklyAmount: al.amount
                                    });
                                    setSchedFrequency(RecurringFrequency.WEEKLY);
                                    setSchedStartDate(todayIso());
                                  }}
                                >
                                  <Repeat size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Saved Income Calculations */}
      {snapshot.incomeCalculations.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16, fontWeight: 700 }}>
            Saved Paycheck &amp; Tax Calculations
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {snapshot.incomeCalculations.map((ic) => (
              <div
                key={ic.id}
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
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {ic.contributorName} · {ic.source}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                    {Money.format(ic.hourlyRate)}/hr × {ic.hoursPerWeek}h/wk · Gross:{' '}
                    {Money.format(ic.weeklyGross)}/wk · Tax: {Money.format(ic.weeklyTax)}/wk
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="mono-num" style={{ fontWeight: 700, color: 'var(--income)' }}>
                    Net: {Money.format(ic.weeklyNet)}/wk
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 8px' }}
                    onClick={() => openCalcModal(ic)}
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 8px', color: 'var(--expense)' }}
                    onClick={() => void deleteIncomeCalculation(ic.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contributor Edit Modal */}
      {contributorModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setContributorModalOpen(false)}
        >
          <div
            className="modal-panel"
            style={{ maxWidth: 580 }}
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
                {editingContributor ? 'Edit Contributor' : 'Add Contributor'}
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setContributorModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveContributor}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
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
                    Contributor Name
                  </label>
                  <input
                    className="input"
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="e.g. Alex, Partner"
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
                    Note (optional)
                  </label>
                  <input
                    className="input"
                    value={cNote}
                    onChange={(e) => setCNote(e.target.value)}
                    placeholder="Role or note..."
                  />
                </div>
              </div>

              {/* Income Sources */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    Weekly Income Sources ($)
                  </label>
                  <button
                    type="button"
                    className="btn btn-tonal"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() =>
                      setCSources((prev) => [
                        ...prev,
                        { label: '', amountInput: '' }
                      ])
                    }
                  >
                    <Plus size={13} /> Add Source
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cSources.map((src, idx) => (
                    <div
                      key={idx}
                      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    >
                      <input
                        className="input"
                        style={{ flex: 2 }}
                        placeholder="Source label (e.g. Paycheck, Side Hustle)"
                        value={src.label}
                        onChange={(e) =>
                          setCSources((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, label: e.target.value } : item
                            )
                          )
                        }
                      />
                      <input
                        className="input mono-num"
                        style={{ flex: 1 }}
                        placeholder="Weekly $"
                        value={src.amountInput}
                        onChange={(e) =>
                          setCSources((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, amountInput: e.target.value }
                                : item
                            )
                          )
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setCSources((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Account Allocations */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    Weekly Account &amp; Envelope Allocations ($)
                  </label>
                  <button
                    type="button"
                    className="btn btn-tonal"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() =>
                      setCAllocations((prev) => [
                        ...prev,
                        {
                          accountId: activeAccounts[0]?.id ?? '',
                          amountInput: ''
                        }
                      ])
                    }
                  >
                    <Plus size={13} /> Add Allocation
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cAllocations.map((al, idx) => (
                    <div
                      key={idx}
                      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    >
                      <select
                        className="select"
                        style={{ flex: 2 }}
                        value={al.accountId}
                        onChange={(e) =>
                          setCAllocations((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, accountId: e.target.value }
                                : item
                            )
                          )
                        }
                      >
                        <option value="">Select account...</option>
                        {activeAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input mono-num"
                        style={{ flex: 1 }}
                        placeholder="Weekly $"
                        value={al.amountInput}
                        onChange={(e) =>
                          setCAllocations((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, amountInput: e.target.value }
                                : item
                            )
                          )
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setCAllocations((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 6
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setContributorModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Contributor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Recurring Contribution Dialog */}
      {schedTarget && (
        <div className="modal-backdrop" onClick={() => setSchedTarget(null)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, fontSize: 17, fontWeight: 700 }}>
              Schedule Recurring Contribution
            </h3>
            <p style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
              Automatically create an Income transaction into the target account on each
              due date.
            </p>
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
                  Frequency
                </label>
                <select
                  className="select"
                  value={schedFrequency}
                  onChange={(e) =>
                    setSchedFrequency(e.target.value as RecurringFrequency)
                  }
                >
                  {ALL_RECURRING_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {RECURRING_FREQUENCY_LABELS[f]}
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
                  First Due Date
                </label>
                <input
                  type="date"
                  className="input mono-num"
                  value={schedStartDate}
                  onChange={(e) => setSchedStartDate(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSchedTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    const acc = activeAccounts.find(
                      (a) => a.id === schedTarget.accountId
                    );
                    if (acc) {
                      await createOrUpdateRecurringFromAllocation({
                        contributorName: schedTarget.contributorName,
                        targetAccount: acc,
                        weeklyAmount: schedTarget.weeklyAmount,
                        frequency: schedFrequency,
                        startDate: schedStartDate
                      });
                    }
                    setSchedTarget(null);
                  }}
                >
                  Schedule Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Income Calculator Modal */}
      {calcModalOpen && (
        <div className="modal-backdrop" onClick={() => setCalcModalOpen(false)}>
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
                Paycheck &amp; Weekly Net Calculator
              </h3>
              <button
                className="btn btn-ghost"
                onClick={() => setCalcModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveCalc}
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
                    Contributor Name
                  </label>
                  <input
                    className="input"
                    value={calcContributorName}
                    onChange={(e) => setCalcContributorName(e.target.value)}
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
                    Income Source Label
                  </label>
                  <input
                    className="input"
                    value={calcSource}
                    onChange={(e) => setCalcSource(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid-3">
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      marginBottom: 5
                    }}
                  >
                    Hourly Rate ($)
                  </label>
                  <input
                    className="input mono-num"
                    value={calcHourlyInput}
                    onChange={(e) => setCalcHourlyInput(e.target.value)}
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
                    Hours / Week
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    className="input mono-num"
                    value={calcHoursPerWeek}
                    onChange={(e) => setCalcHoursPerWeek(e.target.value)}
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
                    Weeks / Year
                  </label>
                  <input
                    type="number"
                    className="input mono-num"
                    value={calcWeeks}
                    onChange={(e) => setCalcWeeks(e.target.value)}
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
                    Weekly Tax Withholding ($)
                  </label>
                  <input
                    className="input mono-num"
                    value={calcTaxInput}
                    onChange={(e) => setCalcTaxInput(e.target.value)}
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
                    Weekly 401(k) / Pre-tax Investment ($)
                  </label>
                  <input
                    className="input mono-num"
                    value={calcInvestInput}
                    onChange={(e) => setCalcInvestInput(e.target.value)}
                  />
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
                  onClick={() => setCalcModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Calculation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
