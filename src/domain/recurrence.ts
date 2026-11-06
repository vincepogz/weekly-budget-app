import {
  Account,
  BudgetPeriod,
  Cents,
  RecurringFrequency,
  RecurringTransaction,
  Transaction,
  TransactionType,
  normalizeRecurringFrequency,
  normalizeTransactionType
} from './models';
import {
  daysBetween,
  formatYmd,
  parseIsoDate,
  plusDaysIso,
  plusMonthsIso,
  plusWeeksIso,
  plusYearsIso,
  toUtcMidnightMillis,
  todayIso
} from './localDate';
import { randomUuid, uuidNameFromBytes } from './crypto';
import { CentsMath } from './cents';

export interface MaterializationResult {
  newTransactions: Transaction[];
  updatedRules: RecurringTransaction[];
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePeriodsByStartAndId(a: BudgetPeriod, b: BudgetPeriod): number {
  const sCmp = compareCodeUnits(a.startDate, b.startDate);
  if (sCmp !== 0) return sCmp;
  return compareCodeUnits(a.id, b.id);
}

function maxPeriod(periods: BudgetPeriod[], cmp: (a: BudgetPeriod, b: BudgetPeriod) => number): BudgetPeriod | null {
  if (periods.length === 0) return null;
  let best = periods[0];
  for (let i = 1; i < periods.length; i++) {
    if (cmp(periods[i], best) > 0) best = periods[i];
  }
  return best;
}

function minPeriod(periods: BudgetPeriod[], cmp: (a: BudgetPeriod, b: BudgetPeriod) => number): BudgetPeriod | null {
  if (periods.length === 0) return null;
  let best = periods[0];
  for (let i = 1; i < periods.length; i++) {
    if (cmp(periods[i], best) < 0) best = periods[i];
  }
  return best;
}

export const RecurringSchedule = {
  CATCH_UP_LIMIT: 400,

  /** [start] plus [k] periods, counted from the anchor date so month-end dates never drift. */
  shifted(startIso: string, frequency: RecurringFrequency, k: number): string {
    const parsed = parseIsoDate(startIso);
    if (!parsed) return startIso;
    const cleanStart = formatYmd(parsed);
    const freq = normalizeRecurringFrequency(frequency);
    const step = Math.max(0, Math.trunc(k));
    switch (freq) {
      case RecurringFrequency.WEEKLY:
        return plusWeeksIso(cleanStart, step);
      case RecurringFrequency.BIWEEKLY:
        return plusWeeksIso(cleanStart, step * 2);
      case RecurringFrequency.MONTHLY:
        return plusMonthsIso(cleanStart, step);
      case RecurringFrequency.YEARLY:
        return plusYearsIso(cleanStart, step);
    }
  },

  firstIndexOnOrAfter(startIso: string, frequency: RecurringFrequency, targetIso: string): number {
    const s = parseIsoDate(startIso);
    const t = parseIsoDate(targetIso);
    if (!s || !t) return 0;
    const sStr = formatYmd(s);
    const tStr = formatYmd(t);
    if (tStr <= sStr) return 0;
    const freq = normalizeRecurringFrequency(frequency);
    const diffDays = daysBetween(sStr, tStr);
    let estimate = 0;
    switch (freq) {
      case RecurringFrequency.WEEKLY:
        estimate = Math.trunc(diffDays / 7);
        break;
      case RecurringFrequency.BIWEEKLY:
        estimate = Math.trunc(diffDays / 14);
        break;
      case RecurringFrequency.MONTHLY:
        estimate = (t.year - s.year) * 12 + (t.month - s.month);
        break;
      case RecurringFrequency.YEARLY:
        estimate = t.year - s.year;
        break;
    }
    let k = Math.max(0, estimate - 1);
    while (RecurringSchedule.shifted(sStr, freq, k) < tStr) {
      k++;
    }
    return k;
  },

  occurrence(start: string, freq: RecurringFrequency, k: number): string | null {
    if (!parseIsoDate(start)) return null;
    return RecurringSchedule.shifted(start, freq, Math.max(0, k));
  },

  nextAfter(start: string, freq: RecurringFrequency, date: string): string | null {
    if (!parseIsoDate(start) || !parseIsoDate(date)) return null;
    const target = plusDaysIso(date, 1);
    const k = RecurringSchedule.firstIndexOnOrAfter(start, freq, target);
    return RecurringSchedule.shifted(start, freq, k);
  },

  anchorOf(rule: Pick<RecurringTransaction, 'startDate' | 'nextDueDate'>): string {
    const start = (rule.startDate ?? '').trim();
    const next = (rule.nextDueDate ?? '').trim();
    if (!start || (next && start > next)) return next;
    return start;
  },

  dueDates(rule: RecurringTransaction, today: string, limit = 400): string[] {
    const freq = normalizeRecurringFrequency(rule.frequency);
    const nextParsed = parseIsoDate(rule.nextDueDate);
    const endParsed = parseIsoDate(today);
    const anchorStr = RecurringSchedule.anchorOf(rule);
    const anchorParsed = parseIsoDate(anchorStr);
    if (!nextParsed || !endParsed || !anchorParsed) return [];
    const nextIso = formatYmd(nextParsed);
    const endIso = formatYmd(endParsed);
    const cleanAnchor = formatYmd(anchorParsed);

    const dates: string[] = [];
    let k = RecurringSchedule.firstIndexOnOrAfter(cleanAnchor, freq, nextIso);
    while (dates.length < limit) {
      const d = RecurringSchedule.shifted(cleanAnchor, freq, k);
      if (d > endIso) break;
      dates.push(d);
      k++;
    }
    return dates;
  },

  nextDueAfter(rule: RecurringTransaction, lastPosted: string): string | null {
    return RecurringSchedule.nextAfter(
      RecurringSchedule.anchorOf(rule),
      normalizeRecurringFrequency(rule.frequency),
      lastPosted
    );
  },

  advanceDate(date: string, frequency: RecurringFrequency, anchorDate?: string): string {
    const anchor = anchorDate && parseIsoDate(anchorDate) ? anchorDate : date;
    return RecurringSchedule.nextAfter(anchor, normalizeRecurringFrequency(frequency), date) ?? date;
  },

  deterministicTransactionId(ruleId: string, dueDate: string): string {
    return uuidNameFromBytes(`recurring|${ruleId}|${dueDate}`);
  },

  deterministicCreatedAt(dueDate: string, fallbackMillis = 0): number {
    return toUtcMidnightMillis(dueDate, fallbackMillis);
  },

  /**
   * Exact port of Recurrence.kt periodIdFor(date, periods).
   * Depends only on the cycles' own dates and ids, never on device-local isCurrent.
   */
  periodIdFor(date: string, periods: BudgetPeriod[]): string {
    const active = periods.filter((p) => !p.isArchived);
    const containing = active.filter(
      (p) =>
        (p.startDate.trim().length > 0 || p.endDate.trim().length > 0) &&
        (p.startDate.trim().length === 0 || p.startDate <= date) &&
        (p.endDate.trim().length === 0 || date <= p.endDate)
    );
    const matchContaining = maxPeriod(containing, comparePeriodsByStartAndId);
    if (matchContaining) return matchContaining.id;

    const dated = active.filter((p) => p.startDate.trim().length > 0);
    const startedBefore = dated.filter((p) => p.startDate <= date);
    const matchBefore = maxPeriod(startedBefore, comparePeriodsByStartAndId);
    if (matchBefore) return matchBefore.id;

    const earliestDated = minPeriod(dated, comparePeriodsByStartAndId);
    if (earliestDated) return earliestDated.id;

    const minActive = minPeriod(active, (a, b) => compareCodeUnits(a.id, b.id));
    if (minActive) return minActive.id;

    const minAny = minPeriod(periods, (a, b) => compareCodeUnits(a.id, b.id));
    return minAny?.id ?? '';
  },

  materializeDue(
    rules: RecurringTransaction[],
    budgetPeriodId: string,
    accountsById: Map<string, Account>,
    today: string = todayIso(),
    _nowMillis: number = Date.now(),
    maxOccurrencesPerRule = 400,
    periods?: BudgetPeriod[]
  ): MaterializationResult {
    const todayParsed = parseIsoDate(today);
    if (!todayParsed) {
      return { newTransactions: [], updatedRules: [] };
    }
    const todayStr = formatYmd(todayParsed);

    const newTransactions: Transaction[] = [];
    const updatedRules: RecurringTransaction[] = [];

    for (const rule of rules) {
      if (!rule.active) continue;
      const effectiveRule: RecurringTransaction = {
        ...rule,
        nextDueDate: rule.nextDueDate || rule.startDate
      };
      const dueList = RecurringSchedule.dueDates(effectiveRule, todayStr, maxOccurrencesPerRule);
      if (dueList.length === 0) continue;

      const normType = normalizeTransactionType(rule.type);
      const isTransfer = normType === TransactionType.TRANSFER;
      const fromAccount = rule.accountId ? accountsById.get(rule.accountId) : undefined;
      const toAccountId = isTransfer ? rule.toAccountId : null;
      const toAccount = toAccountId ? accountsById.get(toAccountId) : undefined;

      for (const dueStr of dueList) {
        const targetPeriodId =
          periods && periods.length > 0
            ? RecurringSchedule.periodIdFor(dueStr, periods)
            : budgetPeriodId;
        newTransactions.push({
          id: RecurringSchedule.deterministicTransactionId(rule.id, dueStr),
          budgetPeriodId: targetPeriodId,
          accountId: rule.accountId,
          accountName: fromAccount?.name ?? '',
          toAccountId,
          toAccountName: toAccount?.name ?? '',
          contributorId: null,
          category: isTransfer ? '' : rule.category,
          subCategory: isTransfer ? '' : rule.subCategory,
          amount: rule.amount,
          type: normType,
          date: dueStr,
          note: rule.title,
          payee: '',
          tag: '',
          isRecurring: true,
          cleared: rule.cleared,
          syncedToMasterSheet: false,
          createdAt: RecurringSchedule.deterministicCreatedAt(dueStr, 0)
        });
      }

      const lastPosted = dueList[dueList.length - 1];
      const nextDue =
        RecurringSchedule.nextDueAfter(effectiveRule, lastPosted) ??
        RecurringSchedule.advanceDate(lastPosted, rule.frequency, effectiveRule.startDate);
      updatedRules.push({
        ...rule,
        startDate: RecurringSchedule.anchorOf(effectiveRule),
        nextDueDate: nextDue
      });
    }

    return { newTransactions, updatedRules };
  }
};

export const RecurringContribution = {
  title(contributorName: string, targetAccountName: string): string {
    const cleanContributor = contributorName.trim();
    const cleanAccount = targetAccountName.trim();
    if (!cleanContributor) return `${cleanAccount} Contribution`.trim();
    return `${cleanContributor} → ${cleanAccount}`;
  },

  category(targetAccountName: string): string {
    return targetAccountName.trim();
  },

  subCategory(contributorName: string): string {
    return contributorName.trim() || 'Contribution';
  },

  amountForFrequency(weeklyAmount: Cents, frequency: RecurringFrequency): Cents {
    switch (normalizeRecurringFrequency(frequency)) {
      case RecurringFrequency.WEEKLY:
        return weeklyAmount;
      case RecurringFrequency.BIWEEKLY:
        return weeklyAmount * 2;
      case RecurringFrequency.MONTHLY:
        return CentsMath.mulDiv(weeklyAmount, 52, 12);
      case RecurringFrequency.YEARLY:
        return weeklyAmount * 52;
    }
  },

  existingMatch(
    rules: RecurringTransaction[],
    targetAccountId: string,
    contributorName: string,
    targetAccountName: string
  ): RecurringTransaction | undefined {
    const expectedTitle = RecurringContribution.title(contributorName, targetAccountName).toLowerCase();
    const expectedSub = RecurringContribution.subCategory(contributorName).toLowerCase();
    return rules.find(
      (r) =>
        normalizeTransactionType(r.type) === TransactionType.DEPOSIT &&
        r.accountId === targetAccountId &&
        (r.title.trim().toLowerCase() === expectedTitle ||
          (r.category.trim().toLowerCase() === targetAccountName.trim().toLowerCase() &&
            r.subCategory.trim().toLowerCase() === expectedSub))
    );
  },

  buildNew(params: {
    contributorName: string;
    targetAccount: Account;
    weeklyAmount: Cents;
    frequency?: RecurringFrequency;
    startDate?: string;
    cleared?: boolean;
  }): RecurringTransaction {
    const frequency = normalizeRecurringFrequency(params.frequency ?? RecurringFrequency.WEEKLY);
    const startDate = params.startDate ?? todayIso();
    return {
      id: randomUuid(),
      title: RecurringContribution.title(params.contributorName, params.targetAccount.name),
      amount: RecurringContribution.amountForFrequency(params.weeklyAmount, frequency),
      type: TransactionType.DEPOSIT,
      accountId: params.targetAccount.id,
      toAccountId: null,
      category: RecurringContribution.category(params.targetAccount.name),
      subCategory: RecurringContribution.subCategory(params.contributorName),
      frequency,
      startDate,
      nextDueDate: startDate,
      active: true,
      cleared: params.cleared ?? true
    };
  }
};
