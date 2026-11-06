import { BudgetPeriod } from './models';
import {
  dayOfWeekIso,
  daysBetweenIso,
  formatYmd,
  nextMondayIso,
  nextOrSameMondayIso,
  parseIsoDate,
  plusDaysIso,
  todayIso
} from './localDate';

export enum CycleStatus {
  UPCOMING = 'UPCOMING',
  CURRENT = 'CURRENT',
  PAST = 'PAST'
}

export interface CycleSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  numberOfWeeks: number;
  currentWeek: number;
  isCurrent: boolean;
  isArchived: boolean;
}

export function toCycleSummary(p: BudgetPeriod): CycleSummary {
  return {
    id: p.id,
    name: p.name,
    startDate: p.startDate,
    endDate: p.endDate,
    numberOfWeeks: p.numberOfWeeks,
    currentWeek: p.currentWeek,
    isCurrent: p.isCurrent,
    isArchived: p.isArchived
  };
}

export interface CyclePickGroups {
  current: CycleSummary | null;
  upcoming: CycleSummary[];
  past: CycleSummary[];
}

export const CyclePlanner = {
  DAYS_PER_WEEK: 7,

  currentCalendarYear(today: string = todayIso()): { startDate: string; endDate: string; weeks: number } {
    const ymd = parseIsoDate(today);
    const year = ymd ? ymd.year : new Date().getFullYear();
    const jan1 = formatYmd({ year, month: 1, day: 1 });
    const dec31 = formatYmd({ year, month: 12, day: 31 });
    const start = nextOrSameMondayIso(jan1);
    const totalDays = daysBetweenIso(start, dec31) + 1;
    const weeks = Math.max(1, Math.floor(totalDays / CyclePlanner.DAYS_PER_WEEK));
    const end = CyclePlanner.computeEndDate(start, weeks);
    return { startDate: start, endDate: end, weeks };
  },

  defaultFirstCyclePlan(today: string = todayIso()): { startDate: string; endDate: string; weeks: number } {
    const ymd = parseIsoDate(today);
    const year = ymd ? ymd.year : new Date().getFullYear();
    const dec31 = formatYmd({ year, month: 12, day: 31 });
    const start = nextMondayIso(today);
    const remainingDays = daysBetweenIso(start, dec31) + 1;
    if (remainingDays < CyclePlanner.DAYS_PER_WEEK) {
      return CyclePlanner.currentCalendarYear(today);
    }
    const weeks = Math.max(1, Math.floor(remainingDays / CyclePlanner.DAYS_PER_WEEK));
    const end = CyclePlanner.computeEndDate(start, weeks);
    return { startDate: start, endDate: end, weeks };
  },

  nextCyclePlan(
    previousEndDate: string | null,
    numberOfWeeks = 52,
    today: string = todayIso()
  ): { startDate: string; endDate: string; weeks: number } {
    const weeks = Math.max(1, numberOfWeeks);
    let start: string;
    const parsedPrev = previousEndDate ? parseIsoDate(previousEndDate) : null;
    if (parsedPrev) {
      const candidate = plusDaysIso(formatYmd(parsedPrev), 1);
      start = dayOfWeekIso(candidate) === 1 ? candidate : nextOrSameMondayIso(candidate);
    } else {
      start = CyclePlanner.currentCalendarYear(today).startDate;
    }
    const end = CyclePlanner.computeEndDate(start, weeks);
    return { startDate: start, endDate: end, weeks };
  },

  computeEndDate(startDate: string, numberOfWeeks: number): string {
    const parsed = parseIsoDate(startDate);
    if (!parsed) return startDate;
    const safeWeeks = Math.max(1, numberOfWeeks);
    return plusDaysIso(formatYmd(parsed), safeWeeks * CyclePlanner.DAYS_PER_WEEK - 1);
  },

  computeCurrentWeek(
    startDate: string,
    numberOfWeeks: number,
    today: string = todayIso()
  ): number {
    const parsedStart = parseIsoDate(startDate);
    const parsedToday = parseIsoDate(today);
    if (!parsedStart || !parsedToday) return 1;
    const safeWeeks = Math.max(1, numberOfWeeks);
    const startIso = formatYmd(parsedStart);
    const todayFormatted = formatYmd(parsedToday);
    if (todayFormatted < startIso) return 1;
    const daysElapsed = daysBetweenIso(startIso, todayFormatted);
    const week = Math.floor(daysElapsed / CyclePlanner.DAYS_PER_WEEK) + 1;
    return Math.min(Math.max(week, 1), safeWeeks);
  },

  yearProgress(startDate: string, numberOfWeeks: number, today: string = todayIso()): number {
    const parsedStart = parseIsoDate(startDate);
    const parsedToday = parseIsoDate(today);
    if (!parsedStart || !parsedToday) return 0;
    const totalDays = Math.max(1, numberOfWeeks) * CyclePlanner.DAYS_PER_WEEK;
    const elapsed = daysBetweenIso(formatYmd(parsedStart), formatYmd(parsedToday)) + 1;
    if (elapsed <= 0) return 0;
    if (elapsed >= totalDays) return 1;
    return elapsed / totalDays;
  }
};

export const CycleSelection = {
  classify(cycle: CycleSummary, today: string = todayIso()): CycleStatus {
    if (cycle.isCurrent) return CycleStatus.CURRENT;
    const start = parseIsoDate(cycle.startDate);
    const end = parseIsoDate(cycle.endDate);
    const t = parseIsoDate(today);
    const todayStr = t ? formatYmd(t) : today;
    if (start && formatYmd(start) > todayStr) return CycleStatus.UPCOMING;
    if (end && formatYmd(end) < todayStr) return CycleStatus.PAST;
    return CycleStatus.UPCOMING;
  },

  partitionForPicker(cycles: CycleSummary[], today: string = todayIso()): CyclePickGroups {
    const current = cycles.find((c) => c.isCurrent) ?? null;
    const others = cycles.filter((c) => c.id !== current?.id);
    const upcoming = others
      .filter((c) => CycleSelection.classify(c, today) === CycleStatus.UPCOMING)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = others
      .filter((c) => CycleSelection.classify(c, today) === CycleStatus.PAST)
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    return { current, upcoming, past };
  },

  resolveAfterDisableCurrent(
    disabledId: string,
    cycles: CycleSummary[],
    today: string = todayIso()
  ): string | null {
    const remaining = cycles.filter((c) => c.id !== disabledId && !c.isArchived);
    if (remaining.length === 0) return null;
    const t = parseIsoDate(today);
    const todayStr = t ? formatYmd(t) : today;

    const coveringToday = remaining.find((c) => {
      const s = parseIsoDate(c.startDate);
      const e = parseIsoDate(c.endDate);
      return s !== null && e !== null && formatYmd(s) <= todayStr && todayStr <= formatYmd(e);
    });
    if (coveringToday) return coveringToday.id;

    const nextUpcoming = remaining
      .filter((c) => CycleSelection.classify(c, todayStr) === CycleStatus.UPCOMING)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (nextUpcoming) return nextUpcoming.id;

    const latestPast = remaining
      .slice()
      .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    return latestPast ? latestPast.id : null;
  },

  needsPastCycleConfirmation(cycle: CycleSummary, today: string = todayIso()): boolean {
    if (cycle.isCurrent) return false;
    return CycleSelection.classify(cycle, today) === CycleStatus.PAST;
  },

  defaultCycleName(startDate: string, existingNames: string[] = []): string {
    const parsed = parseIsoDate(startDate);
    const yearLabel = parsed
      ? String(parsed.year)
      : startDate.slice(0, 4).trim() || 'Budget';
    const base = `${yearLabel} Budget`;
    const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let suffix = 2;
    while (taken.has(`${base} (${suffix})`.toLowerCase())) {
      suffix++;
    }
    return `${base} (${suffix})`;
  }
};
