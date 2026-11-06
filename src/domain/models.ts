export type Cents = number;

export enum AccountType {
  CHECKING = 'CHECKING',
  SAVINGS = 'SAVINGS',
  ENVELOPE = 'ENVELOPE',
  CREDIT_CARD = 'CREDIT_CARD',
  LOAN = 'LOAN',
  OTHER = 'OTHER',
  ALLOWANCE = 'ALLOWANCE',
  INVESTMENT = 'INVESTMENT'
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.CHECKING]: 'Checking',
  [AccountType.SAVINGS]: 'Savings',
  [AccountType.ENVELOPE]: 'Envelope (Sinking Fund)',
  [AccountType.CREDIT_CARD]: 'Credit Card',
  [AccountType.LOAN]: 'Loan',
  [AccountType.OTHER]: 'Other',
  [AccountType.ALLOWANCE]: 'Allowance',
  [AccountType.INVESTMENT]: 'Investment'
};

export function isDebtAccountType(type: AccountType | string): boolean {
  return type === AccountType.CREDIT_CARD || type === AccountType.LOAN || type === 'DEBT';
}

export enum ExpenseType {
  FIXED = 'FIXED',
  VARIABLE = 'VARIABLE'
}

/**
 * Matches Android Entities.kt TransactionType (WITHDRAWAL, DEPOSIT, TRANSFER).
 * INCOME and EXPENSE are retained as enum aliases pointing to DEPOSIT and WITHDRAWAL
 * so all UI code and CSV serialization use the exact Android canonical values.
 */
export enum TransactionType {
  INCOME = 'DEPOSIT',
  DEPOSIT = 'DEPOSIT',
  EXPENSE = 'WITHDRAWAL',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER'
}

export function normalizeTransactionType(raw: string | undefined | null): TransactionType {
  const upper = (raw ?? '').trim().toUpperCase();
  if (upper === 'DEPOSIT' || upper === 'INCOME') return TransactionType.DEPOSIT;
  if (upper === 'TRANSFER') return TransactionType.TRANSFER;
  return TransactionType.WITHDRAWAL;
}

/**
 * Matches Android Recurrence.kt RecurringFrequency (WEEKLY, BIWEEKLY, MONTHLY, YEARLY).
 * BI_WEEKLY is retained as an enum alias pointing to 'BIWEEKLY'.
 */
export enum RecurringFrequency {
  WEEKLY = 'WEEKLY',
  BI_WEEKLY = 'BIWEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export function normalizeRecurringFrequency(raw: string | undefined | null): RecurringFrequency {
  const key = (raw ?? '').trim().toUpperCase().replace(/_/g, '').replace(/\s+/g, '');
  if (key === 'WEEKLY') return RecurringFrequency.WEEKLY;
  if (key === 'BIWEEKLY') return RecurringFrequency.BIWEEKLY;
  if (key === 'YEARLY') return RecurringFrequency.YEARLY;
  return RecurringFrequency.MONTHLY;
}

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  [RecurringFrequency.WEEKLY]: 'Weekly',
  [RecurringFrequency.BIWEEKLY]: 'Every 2 weeks',
  [RecurringFrequency.MONTHLY]: 'Monthly',
  [RecurringFrequency.YEARLY]: 'Yearly'
};

export const ALL_RECURRING_FREQUENCIES: RecurringFrequency[] = [
  RecurringFrequency.WEEKLY,
  RecurringFrequency.BIWEEKLY,
  RecurringFrequency.MONTHLY,
  RecurringFrequency.YEARLY
];

export enum BudgetFrequency {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export const BUDGET_FREQUENCY_META: Record<
  BudgetFrequency,
  { label: string; shortLabel: string }
> = {
  [BudgetFrequency.WEEKLY]: { label: 'Weekly', shortLabel: '/wk' },
  [BudgetFrequency.MONTHLY]: { label: 'Monthly', shortLabel: '/mo' },
  [BudgetFrequency.YEARLY]: { label: 'Yearly', shortLabel: '/yr' }
};

export enum BudgetTotalMode {
  ALL = 'ALL',
  MONTH = 'MONTH',
  YEAR = 'YEAR'
}

export const BUDGET_TOTAL_MODE_META: Record<
  BudgetTotalMode,
  { label: string; subtitle: string; badgeText: string }
> = {
  [BudgetTotalMode.ALL]: {
    label: 'All',
    subtitle: 'Full cycle total',
    badgeText: 'All (Cycle)'
  },
  [BudgetTotalMode.MONTH]: {
    label: 'Month',
    subtitle: 'Monthly equivalent',
    badgeText: 'Monthly'
  },
  [BudgetTotalMode.YEAR]: {
    label: 'Year',
    subtitle: 'Annualized (52 weeks)',
    badgeText: 'Yearly'
  }
};

export enum PercentageBasis {
  INCOME = 'INCOME',
  TOTAL_BUDGET = 'TOTAL_BUDGET'
}

export enum ThemePalette {
  DEFAULT = 'DEFAULT',
  DEEP_OCEAN = 'DEEP_OCEAN',
  FOREST_GLOW = 'FOREST_GLOW',
  MIDNIGHT_VIOLET = 'MIDNIGHT_VIOLET',
  EMBER = 'EMBER',
  ARCTIC = 'ARCTIC'
}

export enum ThemeMode {
  SYSTEM = 'SYSTEM',
  LIGHT = 'LIGHT',
  DARK = 'DARK'
}

export interface BudgetPeriod {
  id: string;
  name: string;
  numberOfWeeks: number;
  currentWeek: number;
  startDate: string;
  endDate: string;
  note: string;
  isCurrent: boolean;
  isArchived: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  startingBalance: Cents;
  targetAmount: Cents;
  colorHex: string;
  isArchived: boolean;
  parentAccountId: string | null;
}

export interface CategoryEntity {
  id: string;
  name: string;
  subCategories: string[];
  /** Preserves exact comma-separated string from CSV when unedited so round-trip hashes never drift. */
  rawSubCategories?: string;
  colorHex: string;
}

export function formatCategorySubCategories(c: CategoryEntity): string {
  if (typeof c.rawSubCategories === 'string') {
    return c.rawSubCategories;
  }
  return c.subCategories
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(', ');
}

export function parseCategorySubCategories(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const separator = !raw.includes(',') && raw.includes('|') ? '|' : ',';
  return raw
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface Contributor {
  id: string;
  budgetPeriodId: string;
  name: string;
  weeklyAllowance: Cents;
  note: string;
}

export interface ContributorIncomeSource {
  id: string;
  contributorId: string;
  budgetPeriodId: string;
  label: string;
  weeklyAmount: Cents;
}

export interface ContributionAllocation {
  id: string;
  budgetPeriodId: string;
  contributorId: string;
  accountId: string;
  amount: Cents;
  percentage: number;
}

export interface BudgetItem {
  id: string;
  budgetPeriodId: string;
  category: string;
  subCategory: string;
  amount: Cents;
  frequency: BudgetFrequency;
  targetAccountId: string | null;
  expenseType: ExpenseType;
}

export interface Transaction {
  id: string;
  budgetPeriodId: string;
  accountId: string | null;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string;
  contributorId: string | null;
  category: string;
  subCategory: string;
  amount: Cents;
  type: TransactionType;
  date: string;
  note: string;
  payee: string;
  tag: string;
  isRecurring: boolean;
  cleared: boolean;
  syncedToMasterSheet: boolean;
  createdAt: number;
}

export interface RecurringTransaction {
  id: string;
  title: string;
  amount: Cents;
  type: TransactionType;
  accountId: string | null;
  toAccountId: string | null;
  category: string;
  subCategory: string;
  frequency: RecurringFrequency;
  startDate: string;
  nextDueDate: string;
  active: boolean;
  cleared: boolean;
}

export interface IncomeCalculation {
  id: string;
  contributorName: string;
  source: string;
  hourlyRate: Cents;
  hoursPerWeek: number;
  numberOfWeeks: number;
  weeklyGross: Cents;
  yearlyGross: Cents;
  weeklyTax: Cents;
  investment: Cents;
  weeklyNet: Cents;
  reported: Cents;
}

export interface BudgetSettings {
  selectedPeriodId: string | null;
  budgetTotalMode: BudgetTotalMode;
  percentageBasis: PercentageBasis;
  masterSyncFolderUri: string | null;
  masterSyncFolderLabel: string | null;
  masterSyncType: 'none' | 'gdrive' | 'local';
  googleAccountEmail: string | null;
  lastSyncedMasterHash: string | null;
  lastMasterSyncAtMillis: number;
  lastMasterSyncStatus: string | null;
  lastLocalChangeAtMillis: number;
  syncDeviceId: string | null;
  themePalette: ThemePalette;
  themeMode: ThemeMode;
  confirmExitEnabled: boolean;
  /** True when the local database still holds only untouched starter seed data. */
  isUntouchedStarterData?: boolean;
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  selectedPeriodId: null,
  budgetTotalMode: BudgetTotalMode.MONTH,
  percentageBasis: PercentageBasis.INCOME,
  masterSyncFolderUri: null,
  masterSyncFolderLabel: null,
  masterSyncType: 'none',
  googleAccountEmail: null,
  lastSyncedMasterHash: null,
  lastMasterSyncAtMillis: 0,
  lastMasterSyncStatus: null,
  lastLocalChangeAtMillis: 0,
  syncDeviceId: null,
  themePalette: ThemePalette.DEFAULT,
  themeMode: ThemeMode.SYSTEM,
  confirmExitEnabled: true,
  isUntouchedStarterData: true
};

export interface AccountReferenceCounts {
  transactionsFrom: number;
  transactionsTo: number;
  allocations: number;
  budgetItems: number;
  recurringRules: number;
  childEnvelopes: number;
}

export function totalAccountReferences(counts: AccountReferenceCounts): number {
  return (
    counts.transactionsFrom +
    counts.transactionsTo +
    counts.allocations +
    counts.budgetItems +
    counts.recurringRules +
    counts.childEnvelopes
  );
}
