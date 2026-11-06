export interface YMD {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 30;
  }
}

export function formatYmd(ymd: YMD): string {
  const y = ymd.year.toString().padStart(4, '0');
  const m = ymd.month.toString().padStart(2, '0');
  const d = ymd.day.toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(raw: string): YMD | null {
  const trimmed = raw.trim();
  const match = ISO_DATE_REGEX.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) return null;
  return { year, month, day };
}

export function todayIso(now: Date = new Date()): string {
  return formatYmd({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  });
}

export function ymdToEpochDay(ymd: YMD): number {
  const utcMs = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
  return Math.floor(utcMs / 86_400_000);
}

export function epochDayToYmd(epochDay: number): YMD {
  const d = new Date(epochDay * 86_400_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
}

export function isoToEpochDay(iso: string): number | null {
  const ymd = parseIsoDate(iso);
  return ymd ? ymdToEpochDay(ymd) : null;
}

export function plusDaysIso(iso: string, days: number): string {
  const ymd = parseIsoDate(iso);
  if (!ymd) return iso;
  return formatYmd(epochDayToYmd(ymdToEpochDay(ymd) + days));
}

export function plusWeeksIso(iso: string, weeks: number): string {
  return plusDaysIso(iso, weeks * 7);
}

export function plusMonthsIso(iso: string, months: number): string {
  const ymd = parseIsoDate(iso);
  if (!ymd) return iso;
  const totalMonths = ymd.year * 12 + (ymd.month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12 + 12) % 12 + 1;
  const clampedDay = Math.min(ymd.day, daysInMonth(targetYear, targetMonth));
  return formatYmd({ year: targetYear, month: targetMonth, day: clampedDay });
}

export function plusYearsIso(iso: string, years: number): string {
  return plusMonthsIso(iso, years * 12);
}

export function daysBetweenIso(startIso: string, endIso: string): number {
  const s = isoToEpochDay(startIso);
  const e = isoToEpochDay(endIso);
  if (s === null || e === null) return 0;
  return e - s;
}

export const daysBetween = daysBetweenIso;

export function dayOfWeekIso(iso: string): number {
  const ymd = parseIsoDate(iso);
  if (!ymd) return 1;
  const jsDay = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function nextOrSameMondayIso(iso: string): string {
  const dow = dayOfWeekIso(iso);
  if (dow === 1) return iso;
  return plusDaysIso(iso, 8 - dow);
}

export function nextMondayIso(iso: string): string {
  const dow = dayOfWeekIso(iso);
  const offset = dow === 1 ? 7 : 8 - dow;
  return plusDaysIso(iso, offset);
}

export function toUtcMidnightMillis(iso: string, fallbackMillis = 0): number {
  const ymd = parseIsoDate(iso);
  if (!ymd) return fallbackMillis;
  return Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0, 0);
}

export function formatUtcTimestampSeconds(millis: number = Date.now()): string {
  const d = new Date(millis);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const min = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`;
}
