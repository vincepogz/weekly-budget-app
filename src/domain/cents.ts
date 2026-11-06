import { BudgetFrequency, BudgetTotalMode, Cents } from './models';

function floorDivBigInt(x: bigint, y: bigint): bigint {
  let q = x / y;
  const r = x % y;
  if (r !== 0n && (x < 0n) !== (y < 0n)) {
    q -= 1n;
  }
  return q;
}

const GROUPED_NUMBER_REGEX = /^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/;
const PLAIN_DECIMAL_REGEX = /^([+-])?(\d*)(?:\.(\d*))?$/;

export const CentsMath = {
  ZERO: 0 as Cents,

  fromDollars(dollars: number): Cents {
    if (!Number.isFinite(dollars)) return 0;
    const sign = dollars < 0 ? -1 : 1;
    const abs = Math.abs(dollars);
    const str = Number(abs.toPrecision(15)).toString();
    return sign * CentsMath.parse(str);
  },

  toDollars(cents: Cents): number {
    return cents / 100.0;
  },

  parse(text: string): Cents {
    const trimmed = text.replace(/\$/g, '').replace(/ /g, '').trim();
    if (!trimmed) return 0;

    let normalized: string;
    if (trimmed.includes(',')) {
      if (!GROUPED_NUMBER_REGEX.test(trimmed)) return 0;
      normalized = trimmed.replace(/,/g, '');
    } else {
      normalized = trimmed;
    }

    const match = PLAIN_DECIMAL_REGEX.exec(normalized);
    if (!match) {
      const num = Number(normalized);
      if (!Number.isFinite(num)) return 0;
      const sign = num < 0 ? -1 : 1;
      return sign * Math.round(Math.abs(num) * 100);
    }

    const sign = match[1] === '-' ? -1n : 1n;
    const wholePart = match[2] || '0';
    const fracPart = match[3] || '';
    if (wholePart === '0' && !match[2] && !fracPart) return 0;

    const paddedFrac = (fracPart + '000').slice(0, 3);
    const centsDigits = BigInt(wholePart) * 100n + BigInt(paddedFrac.slice(0, 2));
    const thirdDigit = Number(paddedFrac[2] || '0');
    const hasMoreNonZero = fracPart.length > 3 && /[1-9]/.test(fracPart.slice(3));

    const rounded = thirdDigit >= 5 || (thirdDigit === 5 && hasMoreNonZero)
      ? centsDigits + 1n
      : centsDigits;

    const result = Number(sign * rounded);
    return Object.is(result, -0) ? 0 : result;
  },

  toPlain(cents: Cents): string {
    const intCents = Math.trunc(cents);
    const sign = intCents < 0 ? '-' : '';
    const abs = Math.abs(intCents);
    const whole = Math.floor(abs / 100);
    const frac = abs % 100;
    return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
  },

  mulDiv(cents: Cents, numerator: number, denominator: number): Cents {
    if (denominator === 0) return 0;
    const c = BigInt(Math.trunc(cents));
    const n = BigInt(Math.trunc(numerator));
    const d = BigInt(Math.trunc(denominator));
    const num = 2n * c * n + d;
    const den = 2n * d;
    const res = Number(floorDivBigInt(num, den));
    return Object.is(res, -0) ? 0 : res;
  },

  percentOf(partCents: Cents, wholeCents: Cents): number {
    if (wholeCents <= 0) return 0.0;
    return (partCents / wholeCents) * 100.0;
  }
};

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export const Money = {
  format(cents: Cents): string {
    return USD_FORMATTER.format(CentsMath.toDollars(cents));
  },

  formatCents(cents: Cents): string {
    return Money.format(cents);
  },

  formatDouble(amount: number): string {
    return USD_FORMATTER.format(amount);
  },

  parse(text: string): Cents {
    return CentsMath.parse(text);
  },

  parseCents(text: string): Cents {
    return CentsMath.parse(text);
  }
};

export const BudgetFrequencyMath = {
  toWeekly(amount: Cents, frequency: BudgetFrequency): Cents {
    switch (frequency) {
      case BudgetFrequency.WEEKLY:
        return amount;
      case BudgetFrequency.MONTHLY:
        return CentsMath.mulDiv(amount, 12, 52);
      case BudgetFrequency.YEARLY:
        return CentsMath.mulDiv(amount, 1, 52);
    }
  },

  fromWeekly(weeklyAmount: Cents, target: BudgetFrequency): Cents {
    switch (target) {
      case BudgetFrequency.WEEKLY:
        return weeklyAmount;
      case BudgetFrequency.MONTHLY:
        return CentsMath.mulDiv(weeklyAmount, 52, 12);
      case BudgetFrequency.YEARLY:
        return weeklyAmount * 52;
    }
  },

  convert(amount: Cents, from: BudgetFrequency, to: BudgetFrequency): Cents {
    if (from === to) return amount;
    if (from === BudgetFrequency.MONTHLY && to === BudgetFrequency.YEARLY) {
      return amount * 12;
    }
    if (from === BudgetFrequency.YEARLY && to === BudgetFrequency.MONTHLY) {
      return CentsMath.mulDiv(amount, 1, 12);
    }
    return BudgetFrequencyMath.fromWeekly(BudgetFrequencyMath.toWeekly(amount, from), to);
  },

  toMonthly(amount: Cents, frequency: BudgetFrequency): Cents {
    return BudgetFrequencyMath.convert(amount, frequency, BudgetFrequency.MONTHLY);
  },

  toYearly(amount: Cents, frequency: BudgetFrequency): Cents {
    return BudgetFrequencyMath.convert(amount, frequency, BudgetFrequency.YEARLY);
  }
};

export const CyclePlan = {
  safeWeeks(numberOfWeeks: number): number {
    return Math.max(1, numberOfWeeks);
  },

  monthsForWeeks(numberOfWeeks: number): number {
    return (CyclePlan.safeWeeks(numberOfWeeks) * 12.0) / 52.0;
  },

  yearsForWeeks(numberOfWeeks: number): number {
    return CyclePlan.safeWeeks(numberOfWeeks) / 52.0;
  },

  cycleTotal(amount: Cents, frequency: BudgetFrequency, numberOfWeeks: number): Cents {
    const weeks = CyclePlan.safeWeeks(numberOfWeeks);
    switch (frequency) {
      case BudgetFrequency.WEEKLY:
        return amount * weeks;
      case BudgetFrequency.MONTHLY:
        return CentsMath.mulDiv(amount, weeks * 12, 52);
      case BudgetFrequency.YEARLY:
        return weeks === 52 ? amount : CentsMath.mulDiv(amount, weeks, 52);
    }
  },

  amountForMode(
    amount: Cents,
    frequency: BudgetFrequency,
    mode: BudgetTotalMode,
    numberOfWeeks: number
  ): Cents {
    switch (mode) {
      case BudgetTotalMode.ALL:
        return CyclePlan.cycleTotal(amount, frequency, numberOfWeeks);
      case BudgetTotalMode.MONTH:
        return BudgetFrequencyMath.toMonthly(amount, frequency);
      case BudgetTotalMode.YEAR:
        return BudgetFrequencyMath.toYearly(amount, frequency);
    }
  },

  weeklyToMode(weeklyAmount: Cents, mode: BudgetTotalMode, numberOfWeeks: number): Cents {
    return CyclePlan.amountForMode(weeklyAmount, BudgetFrequency.WEEKLY, mode, numberOfWeeks);
  },

  formatWeeksCount(numberOfWeeks: number): string {
    const weeks = CyclePlan.safeWeeks(numberOfWeeks);
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  },

  formatMonthsCount(numberOfWeeks: number): string {
    const months = CyclePlan.monthsForWeeks(numberOfWeeks);
    const rounded = Math.round(months);
    if (Math.abs(months - rounded) < 0.05) {
      return rounded === 1 ? '1 month' : `${rounded} months`;
    }
    return `~${months.toFixed(1)} months`;
  }
};
