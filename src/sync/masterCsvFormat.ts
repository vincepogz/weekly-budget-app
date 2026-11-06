import {
  Account,
  AccountType,
  BudgetFrequency,
  BudgetItem,
  BudgetPeriod,
  CategoryEntity,
  Cents,
  ContributionAllocation,
  Contributor,
  ContributorIncomeSource,
  ExpenseType,
  IncomeCalculation,
  RecurringFrequency,
  RecurringTransaction,
  Transaction,
  TransactionType,
  formatCategorySubCategories,
  normalizeRecurringFrequency,
  normalizeTransactionType,
  parseCategorySubCategories
} from '../domain/models';
import { BudgetFrequencyMath, CentsMath, CyclePlan } from '../domain/cents';
import { sha256Hex } from '../domain/crypto';
import { formatUtcTimestampSeconds } from '../domain/localDate';
import {
  DecodedMasterCsv,
  MasterCsvMetadata,
  MasterCsvSnapshot,
  SyncTable
} from './syncModels';

export class MasterCsvFormatException extends Error {
  readonly code:
    | 'EMPTY_FILE'
    | 'NOT_A_MASTER_FILE'
    | 'UNSUPPORTED_NEWER_VERSION'
    | 'CORRUPT_HEADER'
    | 'CONTENT_HASH_MISMATCH';

  constructor(
    code:
      | 'EMPTY_FILE'
      | 'NOT_A_MASTER_FILE'
      | 'UNSUPPORTED_NEWER_VERSION'
      | 'CORRUPT_HEADER'
      | 'CONTENT_HASH_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'MasterCsvFormatException';
    this.code = code;
  }
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function parseCentsCell(raw: string | undefined, fallback: Cents = 0): Cents {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback;
  const parsed = CentsMath.tryParse(trimmed);
  return parsed !== null ? parsed : fallback;
}

function parseDoubleCell(raw: string | undefined, fallback = 0.0): number {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntCell(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseLongCell(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt((raw ?? '').trim(), 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseBool(raw: string | undefined, defaultValue = false): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

/** Matches Entities.kt AccountType.fromString(str). */
export function parseAccountType(raw: string | undefined): AccountType {
  const trimmed = (raw ?? '').trim();
  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  if (upper === 'DEBT' || upper === 'LOAN') return AccountType.LOAN;
  if (upper === 'SAVING' || upper === 'SAVINGS') return AccountType.SAVINGS;
  if (upper === 'CREDITCARD' || upper === 'CREDIT_CARD') return AccountType.CREDIT_CARD;
  if (
    upper === 'GOAL' ||
    upper === 'SINKING_FUND' ||
    upper === 'SINKINGFUND' ||
    upper === 'ENVELOPE'
  ) {
    return AccountType.ENVELOPE;
  }
  if (upper === 'ALLOWANCE') return AccountType.ALLOWANCE;
  if (upper === 'INVESTMENT') return AccountType.INVESTMENT;
  if (upper === 'OTHER') return AccountType.OTHER;
  return AccountType.CHECKING;
}

export function parseBudgetFrequency(raw: string | undefined): BudgetFrequency {
  const upper = (raw ?? '').trim().toUpperCase();
  if (upper === 'MONTHLY') return BudgetFrequency.MONTHLY;
  if (upper === 'YEARLY') return BudgetFrequency.YEARLY;
  return BudgetFrequency.WEEKLY;
}

/** Matches MasterCsvFormat.kt normalizedExpenseType(type): FIXED else VARIABLE. */
export function parseExpenseType(raw: string | undefined): ExpenseType {
  return (raw ?? '').trim().toUpperCase() === 'FIXED'
    ? ExpenseType.FIXED
    : ExpenseType.VARIABLE;
}

export function parseTransactionType(raw: string | undefined): TransactionType {
  return normalizeTransactionType(raw);
}

export function parseRecurringFrequency(raw: string | undefined): RecurringFrequency {
  return normalizeRecurringFrequency(raw);
}

function deterministicId(table: string, row: string[]): string {
  const payload = `${table}|${row.map((c) => c.trim()).join('\u001f')}`;
  return `gen_${sha256Hex(payload).slice(0, 24)}`;
}

function inferLegacyBudgetFrequency(
  weekly: Cents,
  monthly: Cents,
  yearly: Cents
): { frequency: BudgetFrequency; amount: Cents } {
  if (monthly > 0 && weekly === BudgetFrequencyMath.convert(monthly, BudgetFrequency.MONTHLY, BudgetFrequency.WEEKLY)) {
    return { frequency: BudgetFrequency.MONTHLY, amount: monthly };
  }
  if (yearly > 0 && weekly === BudgetFrequencyMath.convert(yearly, BudgetFrequency.YEARLY, BudgetFrequency.WEEKLY)) {
    return { frequency: BudgetFrequency.YEARLY, amount: yearly };
  }
  if (weekly > 0) return { frequency: BudgetFrequency.WEEKLY, amount: weekly };
  if (monthly > 0) return { frequency: BudgetFrequency.MONTHLY, amount: monthly };
  if (yearly > 0) return { frequency: BudgetFrequency.YEARLY, amount: yearly };
  return { frequency: BudgetFrequency.WEEKLY, amount: 0 };
}

export const MasterCsvFormat = {
  FORMAT_VERSION: 3,
  MIN_READABLE_FORMAT_VERSION: 1,
  APP_SCHEMA_VERSION: 1,
  SYNC_PROTOCOL_VERSION: 3,
  OLD_MULTI_FILE_PROTOCOL: 2,
  MAX_ANCESTOR_HASHES: 20,
  FILE_NAME: 'weekly-budget-master.csv',
  REPORTS_DIR_NAME: 'reports',
  TRASH_DIR_NAME: '.trash',

  TABLE_MARKER: '#TABLE',
  META_SECTION: 'meta',
  PERIODS_SECTION: 'periods',
  ACCOUNTS_SECTION: 'accounts',
  CATEGORIES_SECTION: 'categories',
  CONTRIBUTORS_SECTION: 'contributors',
  INCOME_SOURCES_SECTION: 'income_sources',
  ALLOCATIONS_SECTION: 'allocations',
  BUDGET_ITEMS_SECTION: 'budget_items',
  TRANSACTIONS_SECTION: 'transactions',
  RECURRING_SECTION: 'recurring_transactions',
  INCOME_CALC_SECTION: 'income_calculations',
  CYCLE_FILES_SECTION: 'cycle_files',

  formatCents(cents: Cents): string {
    return cents === 0 ? '0.0' : CentsMath.toPlain(cents);
  },

  /**
   * Matches MasterCsvFormat.kt formatDouble(value):
   * Rounds half-up to 2 decimal places; anything that rounds to 0.00 / -0.00 is written as "0.0".
   */
  formatDouble(value: number): string {
    if (!Number.isFinite(value) || value === 0) return '0.0';
    const sign = value < 0 ? -1 : 1;
    const rounded = (sign * Math.round((Math.abs(value) + 1e-12) * 100)) / 100;
    const formatted = rounded.toFixed(2);
    return formatted === '0.00' || formatted === '-0.00' ? '0.0' : formatted;
  },

  /**
   * Matches MasterCsvFormat.kt quoteField(value):
   * RFC 4180 field quoting for comma, quote, newline, carriage return, or leading/trailing space.
   */
  csvEscape(value: string | number | boolean | null | undefined): string {
    const s = value === null || value === undefined ? '' : String(value);
    const needsQuotes =
      s.includes(',') ||
      s.includes('"') ||
      s.includes('\n') ||
      s.includes('\r') ||
      s.startsWith(' ') ||
      s.endsWith(' ');
    return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
  },

  /**
   * Full RFC 4180 CSV parser respecting multiline quoted fields (exact port of MasterCsvFormat.kt parseCsvRows).
   */
  parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let sb = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
          sb += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        currentRow.push(sb);
        sb = '';
      } else if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++; // skip \r\n
        }
        currentRow.push(sb);
        sb = '';
        rows.push(currentRow);
        currentRow = [];
      } else {
        sb += c;
      }
      i++;
    }

    if (sb.length > 0 || currentRow.length > 0) {
      currentRow.push(sb);
      rows.push(currentRow);
    }

    return rows;
  },

  parseCsvLine(line: string): string[] {
    const rows = MasterCsvFormat.parseCsvRows(line);
    return rows[0] ?? [];
  },

  extractTableName(row: string[]): string | null {
    if (row.length === 0) return null;
    const first = row[0].trim();
    if (first.toUpperCase() === MasterCsvFormat.TABLE_MARKER) {
      return row[1]?.trim().toLowerCase() || null;
    }
    if (first.toUpperCase().startsWith(`${MasterCsvFormat.TABLE_MARKER},`)) {
      return first.slice(MasterCsvFormat.TABLE_MARKER.length + 1).trim().toLowerCase() || null;
    }
    return null;
  },

  extractBody(csvText: string): string | null {
    const text = csvText.replace(/^\uFEFF/, '');
    const metaIdx = text.indexOf(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.META_SECTION}`);
    if (metaIdx < 0) return null;
    const next = text.indexOf(`\n${MasterCsvFormat.TABLE_MARKER},`, metaIdx + 1);
    return next < 0 ? '' : text.substring(next + 1);
  },

  isMasterIntact(csvText: string, meta: MasterCsvMetadata | null | undefined): boolean {
    if (!meta || !meta.contentHash || !meta.contentHash.trim()) return false;
    const body = MasterCsvFormat.extractBody(csvText);
    if (body === null) return false;
    return sha256Hex(body).toLowerCase() === meta.contentHash.trim().toLowerCase();
  },

  sha256Hex(text: string): string {
    return sha256Hex(text);
  },

  buildBody(snapshot: MasterCsvSnapshot): string {
    const lines: string[] = [];
    const q = (val: string | number | boolean | null | undefined) =>
      MasterCsvFormat.csvEscape(val);

    const sortedPeriods = snapshot.periods
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.PERIODS_SECTION}`);
    lines.push(
      'id,name,number_of_weeks,current_week,start_date,end_date,note,is_current,is_archived'
    );
    for (const p of sortedPeriods) {
      lines.push(
        [
          q(p.id),
          q(p.name),
          String(p.numberOfWeeks),
          String(p.currentWeek),
          q(p.startDate),
          q(p.endDate),
          q(p.note),
          String(p.isCurrent),
          String(p.isArchived)
        ].join(',')
      );
    }
    lines.push('');

    const sortedAccounts = snapshot.accounts
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.ACCOUNTS_SECTION}`);
    lines.push(
      'id,name,type,starting_balance,target_amount,color_hex,is_archived,parent_account_id'
    );
    for (const a of sortedAccounts) {
      lines.push(
        [
          q(a.id),
          q(a.name),
          q(parseAccountType(a.type)),
          MasterCsvFormat.formatCents(a.startingBalance),
          MasterCsvFormat.formatCents(a.targetAmount),
          q(a.colorHex),
          String(a.isArchived),
          q(a.parentAccountId ?? '')
        ].join(',')
      );
    }
    lines.push('');

    const sortedCategories = snapshot.categories
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.CATEGORIES_SECTION}`);
    lines.push('id,name,sub_categories,color_hex');
    for (const c of sortedCategories) {
      lines.push([q(c.id), q(c.name), q(formatCategorySubCategories(c)), q(c.colorHex)].join(','));
    }
    lines.push('');

    const sortedContributors = snapshot.contributors
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.CONTRIBUTORS_SECTION}`);
    lines.push('id,budget_period_id,name,weekly_allowance,note');
    for (const c of sortedContributors) {
      lines.push(
        [
          q(c.id),
          q(c.budgetPeriodId),
          q(c.name),
          MasterCsvFormat.formatCents(c.weeklyAllowance),
          q(c.note)
        ].join(',')
      );
    }
    lines.push('');

    const sortedSources = snapshot.incomeSources
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.INCOME_SOURCES_SECTION}`);
    lines.push('id,contributor_id,budget_period_id,label,weekly_amount');
    for (const s of sortedSources) {
      lines.push(
        [
          q(s.id),
          q(s.contributorId),
          q(s.budgetPeriodId),
          q(s.label),
          MasterCsvFormat.formatCents(s.weeklyAmount)
        ].join(',')
      );
    }
    lines.push('');

    const sortedAllocations = snapshot.allocations
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.ALLOCATIONS_SECTION}`);
    lines.push('id,budget_period_id,contributor_id,account_id,amount,percentage');
    for (const al of sortedAllocations) {
      lines.push(
        [
          q(al.id),
          q(al.budgetPeriodId),
          q(al.contributorId),
          q(al.accountId),
          MasterCsvFormat.formatCents(al.amount),
          MasterCsvFormat.formatDouble(al.percentage)
        ].join(',')
      );
    }
    lines.push('');

    const sortedBudgetItems = snapshot.budgetItems
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.BUDGET_ITEMS_SECTION}`);
    lines.push(
      'id,budget_period_id,category,sub_category,amount,frequency,target_account_id,expense_type'
    );
    for (const b of sortedBudgetItems) {
      lines.push(
        [
          q(b.id),
          q(b.budgetPeriodId),
          q(b.category),
          q(b.subCategory),
          MasterCsvFormat.formatCents(b.amount),
          q(parseBudgetFrequency(b.frequency)),
          q(b.targetAccountId ?? ''),
          q(parseExpenseType(b.expenseType))
        ].join(',')
      );
    }
    lines.push('');

    const accountsMap = new Map(snapshot.accounts.map((a) => [a.id, a]));
    const sortedTransactions = snapshot.transactions.slice().sort((a, b) => {
      const dCmp = compareCodeUnits(a.date, b.date);
      if (dCmp !== 0) return dCmp;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return compareCodeUnits(a.id, b.id);
    });
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.TRANSACTIONS_SECTION}`);
    lines.push(
      'id,budget_period_id,account_id,account_name,to_account_id,to_account_name,contributor_id,category,sub_category,amount,type,date,note,payee,tag,is_recurring,cleared,created_at'
    );
    for (const t of sortedTransactions) {
      const fromName = t.accountId ? accountsMap.get(t.accountId)?.name ?? '' : '';
      const toName = t.toAccountId ? accountsMap.get(t.toAccountId)?.name ?? '' : '';
      lines.push(
        [
          q(t.id),
          q(t.budgetPeriodId),
          q(t.accountId ?? ''),
          q(fromName),
          q(t.toAccountId ?? ''),
          q(toName),
          q(t.contributorId ?? ''),
          q(t.category),
          q(t.subCategory),
          MasterCsvFormat.formatCents(t.amount),
          q(parseTransactionType(t.type)),
          q(t.date),
          q(t.note),
          q(t.payee),
          q(t.tag),
          String(t.isRecurring),
          String(t.cleared),
          String(t.createdAt)
        ].join(',')
      );
    }
    lines.push('');

    const sortedRecurring = snapshot.recurringTransactions
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.RECURRING_SECTION}`);
    lines.push(
      'id,title,amount,type,account_id,to_account_id,category,sub_category,frequency,start_date,next_due_date,active,cleared'
    );
    for (const r of sortedRecurring) {
      const effectiveStart = r.startDate.trim() ? r.startDate : r.nextDueDate;
      lines.push(
        [
          q(r.id),
          q(r.title),
          MasterCsvFormat.formatCents(r.amount),
          q(parseTransactionType(r.type)),
          q(r.accountId ?? ''),
          q(r.toAccountId ?? ''),
          q(r.category),
          q(r.subCategory),
          q(parseRecurringFrequency(r.frequency)),
          q(effectiveStart),
          q(r.nextDueDate),
          String(r.active),
          String(r.cleared)
        ].join(',')
      );
    }
    lines.push('');

    const sortedCalc = snapshot.incomeCalculations
      .slice()
      .sort((a, b) => compareCodeUnits(a.id, b.id));
    lines.push(`${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.INCOME_CALC_SECTION}`);
    lines.push(
      'id,contributor_name,source,hourly_rate,hours_per_week,number_of_weeks,weekly_gross,yearly_gross,weekly_tax,investment,weekly_net,reported'
    );
    for (const ic of sortedCalc) {
      lines.push(
        [
          q(ic.id),
          q(ic.contributorName),
          q(ic.source),
          MasterCsvFormat.formatCents(ic.hourlyRate),
          MasterCsvFormat.formatDouble(ic.hoursPerWeek),
          String(ic.numberOfWeeks),
          MasterCsvFormat.formatCents(ic.weeklyGross),
          MasterCsvFormat.formatCents(ic.yearlyGross),
          MasterCsvFormat.formatCents(ic.weeklyTax),
          MasterCsvFormat.formatCents(ic.investment),
          MasterCsvFormat.formatCents(ic.weeklyNet),
          MasterCsvFormat.formatCents(ic.reported)
        ].join(',')
      );
    }

    return lines.join('\n') + '\n';
  },

  buildCountsSummary(s: MasterCsvSnapshot): string {
    return [
      `periods:${s.periods.length}`,
      `accounts:${s.accounts.length}`,
      `categories:${s.categories.length}`,
      `contributors:${s.contributors.length}`,
      `income_sources:${s.incomeSources.length}`,
      `allocations:${s.allocations.length}`,
      `budget_items:${s.budgetItems.length}`,
      `transactions:${s.transactions.length}`,
      `recurring_transactions:${s.recurringTransactions.length}`,
      `income_calculations:${s.incomeCalculations.length}`
    ].join(';');
  },

  computeBodyHash(snapshot: MasterCsvSnapshot): string {
    return sha256Hex(MasterCsvFormat.buildBody(snapshot));
  },

  encode(
    snapshot: MasterCsvSnapshot,
    options?: {
      revision?: number;
      writtenAtMillis?: number;
      writtenByDeviceId?: string;
      ancestorHashes?: string[];
    }
  ): { csvText: string; metadata: MasterCsvMetadata } {
    const revision = options?.revision ?? 1;
    const writtenAtMillis = options?.writtenAtMillis ?? Date.now();
    const writtenByDeviceId = (options?.writtenByDeviceId ?? '')
      .replace(/[\r\n]/g, ' ')
      .trim();
    const ancestorHashes = options?.ancestorHashes ?? [];

    const body = MasterCsvFormat.buildBody(snapshot);
    const contentHash = sha256Hex(body);
    const writtenAtIso = formatUtcTimestampSeconds(writtenAtMillis);
    const countsSummary = MasterCsvFormat.buildCountsSummary(snapshot);
    const trimmedAncestors = ancestorHashes
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .slice(0, MasterCsvFormat.MAX_ANCESTOR_HASHES);

    const metadata: MasterCsvMetadata = {
      formatVersion: MasterCsvFormat.FORMAT_VERSION,
      appSchemaVersion: MasterCsvFormat.APP_SCHEMA_VERSION,
      revision,
      writtenAtIso,
      contentHash,
      countsSummary,
      syncProtocolVersion: MasterCsvFormat.SYNC_PROTOCOL_VERSION,
      writtenByDeviceId,
      ancestorHashes: trimmedAncestors
    };

    const headerLines: string[] = [
      `${MasterCsvFormat.TABLE_MARKER},${MasterCsvFormat.META_SECTION}`,
      'key,value',
      `format_version,${metadata.formatVersion}`,
      `app_schema_version,${metadata.appSchemaVersion}`,
      `revision,${metadata.revision}`,
      `written_at,${MasterCsvFormat.csvEscape(metadata.writtenAtIso)}`,
      `content_hash,${metadata.contentHash}`,
      `counts,${MasterCsvFormat.csvEscape(metadata.countsSummary)}`
    ];
    if (metadata.syncProtocolVersion > 0) {
      headerLines.push(`sync_protocol,${metadata.syncProtocolVersion}`);
    }
    if (metadata.writtenByDeviceId.length > 0) {
      headerLines.push(`written_by,${MasterCsvFormat.csvEscape(metadata.writtenByDeviceId)}`);
    }
    if (metadata.ancestorHashes.length > 0) {
      headerLines.push(
        `ancestors,${MasterCsvFormat.csvEscape(metadata.ancestorHashes.join(';'))}`
      );
    }
    headerLines.push('', '');

    const csvText = headerLines.join('\n') + body;
    return { csvText, metadata };
  },

  readMeta(csvText: string): MasterCsvMetadata | null {
    const text = csvText.replace(/^\uFEFF/, '');
    const rows = MasterCsvFormat.parseCsvRows(text);
    let inMeta = false;
    let headerSeen = false;
    const metaMap = new Map<string, string>();

    for (const row of rows) {
      if (row.length === 0 || row.every((c) => !c.trim())) continue;
      const table = MasterCsvFormat.extractTableName(row);
      if (table !== null) {
        if (table === MasterCsvFormat.META_SECTION) {
          inMeta = true;
          headerSeen = false;
          continue;
        } else if (inMeta) {
          break;
        }
      } else if (inMeta) {
        if (!headerSeen) {
          headerSeen = true;
          continue;
        }
        if (row.length >= 2) {
          metaMap.set(row[0].trim().toLowerCase(), row[1]);
        }
      }
    }

    if (metaMap.size === 0) return null;

    const ancestorsStr = metaMap.get('ancestors') ?? '';
    const ancestorHashes = ancestorsStr.trim()
      ? ancestorsStr
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];

    return {
      formatVersion:
        Number.parseInt(metaMap.get('format_version') ?? '', 10) ||
        MasterCsvFormat.FORMAT_VERSION,
      appSchemaVersion:
        Number.parseInt(metaMap.get('app_schema_version') ?? '', 10) ||
        MasterCsvFormat.APP_SCHEMA_VERSION,
      revision: Number.parseInt(metaMap.get('revision') ?? '', 10) || 1,
      writtenAtIso: metaMap.get('written_at') ?? '',
      contentHash: (metaMap.get('content_hash') ?? '').trim(),
      countsSummary: metaMap.get('counts') ?? '',
      syncProtocolVersion:
        Number.parseInt((metaMap.get('sync_protocol') ?? '').trim(), 10) || 1,
      writtenByDeviceId: metaMap.get('written_by') ?? '',
      ancestorHashes
    };
  },

  /**
   * Exact port of MasterCsvFormat.kt decodeTables / decodeMaster.
   * Never mutates stored strings with Title-Case or drops rows with blank references.
   */
  decode(csvText: string, verifyHash = false): DecodedMasterCsv {
    const cleaned = csvText.replace(/^\uFEFF/, '');
    if (!cleaned.trim()) {
      throw new MasterCsvFormatException('EMPTY_FILE', 'Master CSV file is empty.');
    }

    const rows = MasterCsvFormat.parseCsvRows(cleaned);
    let currentTable: string | null = null;
    let currentHeaders: Map<string, number> | null = null;
    let sawAnyTable = false;
    let hasCycleFiles = false;

    const periods: BudgetPeriod[] = [];
    const accounts: Account[] = [];
    const categories: CategoryEntity[] = [];
    const contributors: Contributor[] = [];
    const incomeSources: ContributorIncomeSource[] = [];
    const allocations: ContributionAllocation[] = [];
    const budgetItems: BudgetItem[] = [];
    const transactions: Transaction[] = [];
    const recurringTransactions: RecurringTransaction[] = [];
    const incomeCalculations: IncomeCalculation[] = [];
    const legacyIncomes = new Map<string, Cents[]>();

    for (const row of rows) {
      if (row.length === 0 || row.every((c) => !c.trim())) continue;

      const table = MasterCsvFormat.extractTableName(row);
      if (table !== null) {
        sawAnyTable = true;
        currentTable = table;
        currentHeaders = null;
        if (table === MasterCsvFormat.CYCLE_FILES_SECTION) {
          hasCycleFiles = true;
        }
        continue;
      }

      if (currentTable === null || currentTable === MasterCsvFormat.META_SECTION) {
        continue;
      }

      if (currentHeaders === null) {
        currentHeaders = new Map<string, number>();
        row.forEach((col, idx) => {
          currentHeaders!.set(col.trim().toLowerCase().replace(/\s+/g, '_'), idx);
        });
        continue;
      }

      const headers = currentHeaders;
      const hasCol = (key: string): boolean => headers.has(key);
      const getCol = (key: string): string => {
        const idx = headers.get(key);
        return idx !== undefined && idx >= 0 && idx < row.length ? row[idx].trim() : '';
      };
      const idFor = (tbl: string): string => {
        const rawId = getCol('id');
        return rawId ? rawId : deterministicId(tbl, row);
      };

      switch (currentTable) {
        case MasterCsvFormat.PERIODS_SECTION:
          periods.push({
            id: idFor(MasterCsvFormat.PERIODS_SECTION),
            name: getCol('name') || 'Budget Cycle',
            numberOfWeeks: parseIntCell(getCol('number_of_weeks'), 1),
            currentWeek: parseIntCell(getCol('current_week'), 1),
            startDate: getCol('start_date'),
            endDate: getCol('end_date'),
            note: getCol('note'),
            isCurrent: parseBool(getCol('is_current'), false),
            isArchived: parseBool(getCol('is_archived'), false)
          });
          break;

        case MasterCsvFormat.ACCOUNTS_SECTION:
          accounts.push({
            id: idFor(MasterCsvFormat.ACCOUNTS_SECTION),
            name: getCol('name') || 'Account',
            type: parseAccountType(getCol('type')),
            startingBalance: parseCentsCell(getCol('starting_balance')),
            targetAmount: parseCentsCell(getCol('target_amount')),
            colorHex: getCol('color_hex') || '#006C4C',
            isArchived: parseBool(getCol('is_archived'), false),
            parentAccountId: getCol('parent_account_id') || null
          });
          break;

        case MasterCsvFormat.CATEGORIES_SECTION: {
          const subsRaw = getCol('sub_categories');
          categories.push({
            id: idFor(MasterCsvFormat.CATEGORIES_SECTION),
            name: getCol('name') || 'Category',
            subCategories: parseCategorySubCategories(subsRaw),
            rawSubCategories: subsRaw,
            colorHex: getCol('color_hex') || '#006C4C'
          });
          break;
        }

        case MasterCsvFormat.CONTRIBUTORS_SECTION: {
          const contributor: Contributor = {
            id: idFor(MasterCsvFormat.CONTRIBUTORS_SECTION),
            budgetPeriodId: getCol('budget_period_id'),
            name: getCol('name') || 'Contributor',
            weeklyAllowance: parseCentsCell(getCol('weekly_allowance')),
            note: getCol('note')
          };
          contributors.push(contributor);
          if (hasCol('income1')) {
            legacyIncomes.set(contributor.id, [
              parseCentsCell(getCol('income1')),
              parseCentsCell(getCol('income2')),
              parseCentsCell(getCol('income3'))
            ]);
          }
          break;
        }

        case MasterCsvFormat.INCOME_SOURCES_SECTION:
          incomeSources.push({
            id: idFor(MasterCsvFormat.INCOME_SOURCES_SECTION),
            contributorId: getCol('contributor_id'),
            budgetPeriodId: getCol('budget_period_id'),
            label: getCol('label') || 'Income',
            weeklyAmount: parseCentsCell(getCol('weekly_amount'))
          });
          break;

        case MasterCsvFormat.ALLOCATIONS_SECTION:
          allocations.push({
            id: idFor(MasterCsvFormat.ALLOCATIONS_SECTION),
            budgetPeriodId: getCol('budget_period_id'),
            contributorId: getCol('contributor_id'),
            accountId: getCol('account_id'),
            amount: parseCentsCell(getCol('amount')),
            percentage: parseDoubleCell(getCol('percentage'), 0.0)
          });
          break;

        case MasterCsvFormat.BUDGET_ITEMS_SECTION: {
          const rawExpenseType =
            getCol('expense_type') || getCol('expensetype') || getCol('type');
          const { frequency, amount } = hasCol('amount')
            ? {
                frequency: parseBudgetFrequency(getCol('frequency')),
                amount: parseCentsCell(getCol('amount'))
              }
            : inferLegacyBudgetFrequency(
                parseCentsCell(getCol('weekly_amount')),
                parseCentsCell(getCol('monthly_amount')),
                parseCentsCell(getCol('yearly_amount'))
              );
          budgetItems.push({
            id: idFor(MasterCsvFormat.BUDGET_ITEMS_SECTION),
            budgetPeriodId: getCol('budget_period_id'),
            category: getCol('category') || 'OTHER',
            subCategory: getCol('sub_category') || 'MISC',
            amount,
            frequency,
            targetAccountId: getCol('target_account_id') || null,
            expenseType: parseExpenseType(rawExpenseType)
          });
          break;
        }

        case MasterCsvFormat.TRANSACTIONS_SECTION:
          transactions.push({
            id: idFor(MasterCsvFormat.TRANSACTIONS_SECTION),
            budgetPeriodId: getCol('budget_period_id'),
            accountId: getCol('account_id'),
            accountName: getCol('account_name'),
            toAccountId: getCol('to_account_id') || null,
            toAccountName: getCol('to_account_name'),
            contributorId: getCol('contributor_id') || null,
            category: getCol('category'),
            subCategory: getCol('sub_category'),
            amount: parseCentsCell(getCol('amount')),
            type: parseTransactionType(getCol('type')),
            date: getCol('date'),
            note: getCol('note'),
            payee: getCol('payee'),
            tag: getCol('tag'),
            isRecurring: parseBool(getCol('is_recurring'), false),
            cleared: parseBool(getCol('cleared'), true),
            syncedToMasterSheet: true,
            createdAt: parseLongCell(getCol('created_at'), 0)
          });
          break;

        case MasterCsvFormat.RECURRING_SECTION: {
          const nextDueDate = getCol('next_due_date');
          recurringTransactions.push({
            id: idFor(MasterCsvFormat.RECURRING_SECTION),
            title: getCol('title'),
            amount: parseCentsCell(getCol('amount')),
            type: parseTransactionType(getCol('type')),
            accountId: getCol('account_id'),
            toAccountId: getCol('to_account_id') || null,
            category: getCol('category'),
            subCategory: getCol('sub_category'),
            frequency: parseRecurringFrequency(getCol('frequency')),
            startDate: getCol('start_date') || nextDueDate,
            nextDueDate,
            active: parseBool(getCol('active'), true),
            cleared: parseBool(getCol('cleared'), true)
          });
          break;
        }

        case MasterCsvFormat.INCOME_CALC_SECTION:
          incomeCalculations.push({
            id: idFor(MasterCsvFormat.INCOME_CALC_SECTION),
            contributorName: getCol('contributor_name'),
            source: getCol('source'),
            hourlyRate: parseCentsCell(getCol('hourly_rate')),
            hoursPerWeek: parseDoubleCell(getCol('hours_per_week'), 40.0),
            numberOfWeeks: parseIntCell(getCol('number_of_weeks'), 52),
            weeklyGross: parseCentsCell(getCol('weekly_gross')),
            yearlyGross: parseCentsCell(getCol('yearly_gross')),
            weeklyTax: parseCentsCell(getCol('weekly_tax')),
            investment: parseCentsCell(getCol('investment')),
            weeklyNet: parseCentsCell(getCol('weekly_net')),
            reported: parseCentsCell(getCol('reported'))
          });
          break;
      }
    }

    if (!sawAnyTable) {
      throw new MasterCsvFormatException(
        'NOT_A_MASTER_FILE',
        'No #TABLE sections found in Master CSV.'
      );
    }

    for (const contributor of contributors) {
      const incomes = legacyIncomes.get(contributor.id);
      if (!incomes) continue;
      if (incomeSources.some((s) => s.contributorId === contributor.id)) continue;
      incomes.forEach((cents, index) => {
        if (cents > 0) {
          incomeSources.push({
            id: `${contributor.id}_inc${index + 1}`,
            contributorId: contributor.id,
            budgetPeriodId: contributor.budgetPeriodId,
            label: `Income ${index + 1}`,
            weeklyAmount: cents
          });
        }
      });
    }

    const readMetadata = MasterCsvFormat.readMeta(cleaned);
    if (readMetadata && (readMetadata.formatVersion > MasterCsvFormat.FORMAT_VERSION || readMetadata.formatVersion < MasterCsvFormat.MIN_READABLE_FORMAT_VERSION)) {
      throw new MasterCsvFormatException(
        'UNSUPPORTED_NEWER_VERSION',
        `Unsupported format_version ${readMetadata.formatVersion}. This app reads versions ${MasterCsvFormat.MIN_READABLE_FORMAT_VERSION} to ${MasterCsvFormat.FORMAT_VERSION}.`
      );
    }

    const metadata: MasterCsvMetadata = readMetadata ?? {
      formatVersion: MasterCsvFormat.FORMAT_VERSION,
      appSchemaVersion: MasterCsvFormat.APP_SCHEMA_VERSION,
      revision: 1,
      writtenAtIso: '',
      contentHash: '',
      countsSummary: '',
      syncProtocolVersion: 1,
      writtenByDeviceId: '',
      ancestorHashes: []
    };

    const rawSnapshot: MasterCsvSnapshot = {
      periods,
      accounts,
      categories,
      contributors,
      incomeSources,
      allocations,
      budgetItems,
      transactions,
      recurringTransactions,
      incomeCalculations
    };

    const warnings: string[] = [];
    const structuralErr = MasterCsvFormat.structuralError(rawSnapshot, readMetadata, false);
    if (structuralErr) {
      throw new MasterCsvFormatException('CORRUPT_HEADER', structuralErr);
    }

    const deduplicatedTxMap = new Map<string, Transaction>();
    for (const tx of rawSnapshot.transactions) {
      deduplicatedTxMap.set(tx.id, tx);
    }
    const duplicateTxCount = rawSnapshot.transactions.length - deduplicatedTxMap.size;
    if (duplicateTxCount > 0) {
      warnings.push(
        `${duplicateTxCount} duplicate transaction IDs in the shared file; the last occurrence was kept`
      );
    }

    const refWarnings = MasterCsvFormat.referenceWarnings(rawSnapshot);
    warnings.push(...refWarnings);

    if (
      hasCycleFiles ||
      metadata.syncProtocolVersion === MasterCsvFormat.OLD_MULTI_FILE_PROTOCOL ||
      metadata.formatVersion < MasterCsvFormat.FORMAT_VERSION
    ) {
      warnings.push(
        'The shared folder was written by an older version and has been rewritten in the current format.'
      );
    }

    const intact = MasterCsvFormat.isMasterIntact(cleaned, readMetadata);
    if (!intact) {
      if (verifyHash) {
        if (!readMetadata || !readMetadata.contentHash) {
          throw new MasterCsvFormatException(
            'CORRUPT_HEADER',
            'The master file has no readable header.'
          );
        }
        throw new MasterCsvFormatException(
          'CONTENT_HASH_MISMATCH',
          'The master file is incomplete (it may still be uploading).'
        );
      } else if (readMetadata && readMetadata.contentHash) {
        warnings.push(
          'Master CSV content_hash differed from body (file may be incomplete or edited externally).'
        );
      }
    }

    return {
      snapshot: {
        ...rawSnapshot,
        transactions: Array.from(deduplicatedTxMap.values())
      },
      metadata,
      warnings
    };
  },

  structuralError(
    data: MasterCsvSnapshot,
    meta: MasterCsvMetadata | null,
    includeTransactions: boolean
  ): string | null {
    if (
      meta !== null &&
      (meta.formatVersion < MasterCsvFormat.MIN_READABLE_FORMAT_VERSION ||
        meta.formatVersion > MasterCsvFormat.FORMAT_VERSION)
    ) {
      return `Unsupported format_version ${meta.formatVersion}. This app reads versions ${MasterCsvFormat.MIN_READABLE_FORMAT_VERSION} to ${MasterCsvFormat.FORMAT_VERSION}.`;
    }

    const checkDuplicateIds = <T>(
      table: string,
      items: T[],
      idSelector: (item: T) => string
    ): string | null => {
      const seen = new Set<string>();
      for (let idx = 0; idx < items.length; idx++) {
        const id = idSelector(items[idx]);
        if (id && seen.has(id)) {
          return `Error in section '${table}' at row ${idx + 1}: Duplicate ID '${id}' found in ${table}`;
        }
        if (id) seen.add(id);
      }
      return null;
    };

    return (
      checkDuplicateIds(MasterCsvFormat.PERIODS_SECTION, data.periods, (x) => x.id) ??
      checkDuplicateIds(MasterCsvFormat.ACCOUNTS_SECTION, data.accounts, (x) => x.id) ??
      checkDuplicateIds(MasterCsvFormat.CATEGORIES_SECTION, data.categories, (x) => x.id) ??
      checkDuplicateIds(MasterCsvFormat.CONTRIBUTORS_SECTION, data.contributors, (x) => x.id) ??
      checkDuplicateIds(MasterCsvFormat.INCOME_SOURCES_SECTION, data.incomeSources, (x) => x.id) ??
      checkDuplicateIds(MasterCsvFormat.ALLOCATIONS_SECTION, data.allocations, (x) => x.id) ??
      checkDuplicateIds(MasterCsvFormat.BUDGET_ITEMS_SECTION, data.budgetItems, (x) => x.id) ??
      (includeTransactions
        ? checkDuplicateIds(MasterCsvFormat.TRANSACTIONS_SECTION, data.transactions, (x) => x.id)
        : null) ??
      checkDuplicateIds(
        MasterCsvFormat.RECURRING_SECTION,
        data.recurringTransactions,
        (x) => x.id
      ) ??
      checkDuplicateIds(
        MasterCsvFormat.INCOME_CALC_SECTION,
        data.incomeCalculations,
        (x) => x.id
      )
    );
  },

  referenceWarnings(data: MasterCsvSnapshot): string[] {
    const problems: { kind: string; detail: string }[] = [];
    const accountIds = new Set(data.accounts.map((a) => a.id));

    data.transactions.forEach((tx, idx) => {
      const rowNum = idx + 1;
      const table = MasterCsvFormat.TRANSACTIONS_SECTION;
      const txType = parseTransactionType(tx.type);
      if (tx.amount < 0) {
        problems.push({
          kind: 'Negative transaction amount',
          detail: `Error in section '${table}' at row ${rowNum}: Negative transaction amount ${CentsMath.toPlain(tx.amount)}`
        });
      } else if (!tx.accountId || !tx.accountId.trim()) {
        problems.push({
          kind: 'Transaction is missing required account_id',
          detail: `Error in section '${table}' at row ${rowNum}: Transaction is missing required account_id`
        });
      } else if (!accountIds.has(tx.accountId)) {
        problems.push({
          kind: 'Transaction references unknown account_id',
          detail: `Error in section '${table}' at row ${rowNum}: Transaction references unknown account_id '${tx.accountId}'`
        });
      } else if (txType === TransactionType.TRANSFER && (!tx.toAccountId || !tx.toAccountId.trim())) {
        problems.push({
          kind: 'Transfer transaction is missing destination to_account_id',
          detail: `Error in section '${table}' at row ${rowNum}: Transfer transaction is missing destination to_account_id`
        });
      } else if (txType === TransactionType.TRANSFER && tx.toAccountId === tx.accountId) {
        problems.push({
          kind: 'Transfer destination account',
          detail: `Error in section '${table}' at row ${rowNum}: Transfer destination account '${tx.toAccountId}' cannot be the same as source account`
        });
      } else if (txType === TransactionType.TRANSFER && tx.toAccountId && !accountIds.has(tx.toAccountId)) {
        problems.push({
          kind: 'Transfer destination account',
          detail: `Error in section '${table}' at row ${rowNum}: Transfer destination account '${tx.toAccountId}' does not exist in accounts table`
        });
      }
    });

    data.allocations.forEach((alloc, idx) => {
      if (alloc.accountId && alloc.accountId.trim() && !accountIds.has(alloc.accountId)) {
        problems.push({
          kind: 'Allocation references unknown account_id',
          detail: `Error in section '${MasterCsvFormat.ALLOCATIONS_SECTION}' at row ${idx + 1}: Allocation references unknown account_id '${alloc.accountId}'`
        });
      }
    });

    const grouped = new Map<string, string[]>();
    for (const p of problems) {
      const list = grouped.get(p.kind) ?? [];
      list.push(p.detail);
      grouped.set(p.kind, list);
    }

    const warnings: string[] = [];
    for (const [kind, list] of grouped.entries()) {
      warnings.push(list.length === 1 ? list[0] : `${kind} (${list.length} rows)`);
    }
    return warnings;
  },

  /**
   * Preserves all rows without mutating stored strings or dropping references;
   * only deduplicates transactions by ID (keeping the last occurrence, matching SyncEngine.kt:513).
   */
  validateAndRepair(snapshot: MasterCsvSnapshot, _warnings?: string[]): MasterCsvSnapshot {
    const txMap = new Map<string, Transaction>();
    for (const tx of snapshot.transactions) {
      txMap.set(tx.id, tx);
    }
    return {
      ...snapshot,
      transactions: Array.from(txMap.values())
    };
  },

  generateReportFiles(snapshot: MasterCsvSnapshot): Record<string, string> {
    const activePeriod =
      snapshot.periods.find((p) => p.isCurrent) ?? snapshot.periods[0] ?? null;
    const periodById = new Map(snapshot.periods.map((p) => [p.id, p]));
    const accountById = new Map(snapshot.accounts.map((a) => [a.id, a]));

    const overviewLines: string[] = [];
    const ovRow = (...cells: string[]) =>
      overviewLines.push(cells.map((c) => MasterCsvFormat.csvEscape(c)).join(','));
    ovRow('Section', 'Cycle', 'Name / Category', 'Detail', 'Weekly ($)', 'Monthly ($)', 'Cycle Total ($)');

    for (const p of snapshot.periods) {
      const weeks = CyclePlan.safeWeeks(p.numberOfWeeks);
      const contributors = snapshot.contributors.filter((c) => c.budgetPeriodId === p.id);
      const sources = snapshot.incomeSources.filter((s) => s.budgetPeriodId === p.id);
      const budgetItems = snapshot.budgetItems.filter((b) => b.budgetPeriodId === p.id);
      const totalWeeklyIncome = contributors.reduce((acc, c) => {
        const cSources = sources.filter((s) => s.contributorId === c.id);
        if (cSources.length > 0) {
          return acc + cSources.reduce((sum, s) => sum + s.weeklyAmount, 0);
        }
        return acc + c.weeklyAllowance;
      }, 0);
      const totalWeeklyBudget = budgetItems.reduce(
        (acc, b) => acc + BudgetFrequencyMath.toWeekly(b.amount, b.frequency),
        0
      );
      const netWeekly = totalWeeklyIncome - totalWeeklyBudget;
      ovRow(
        'Cycle Summary',
        p.name,
        p.isCurrent ? 'ACTIVE CYCLE' : 'Cycle',
        `${p.startDate} to ${p.endDate} (${p.numberOfWeeks} wks)`,
        MasterCsvFormat.formatCents(totalWeeklyIncome),
        MasterCsvFormat.formatCents(
          BudgetFrequencyMath.toMonthly(totalWeeklyIncome, BudgetFrequency.WEEKLY)
        ),
        MasterCsvFormat.formatCents(totalWeeklyIncome * weeks)
      );
      ovRow(
        'Cycle Planned Spending',
        p.name,
        'Total Planned Budget',
        `${budgetItems.length} lines`,
        MasterCsvFormat.formatCents(totalWeeklyBudget),
        MasterCsvFormat.formatCents(
          BudgetFrequencyMath.toMonthly(totalWeeklyBudget, BudgetFrequency.WEEKLY)
        ),
        MasterCsvFormat.formatCents(totalWeeklyBudget * weeks)
      );
      ovRow(
        'Cycle Net Cash Flow',
        p.name,
        'Unallocated / Remaining',
        netWeekly >= 0 ? 'Surplus' : 'Deficit',
        MasterCsvFormat.formatCents(netWeekly),
        MasterCsvFormat.formatCents(
          BudgetFrequencyMath.toMonthly(netWeekly, BudgetFrequency.WEEKLY)
        ),
        MasterCsvFormat.formatCents(netWeekly * weeks)
      );
    }

    const accountLines: string[] = [];
    const acRow = (...cells: string[]) =>
      accountLines.push(cells.map((c) => MasterCsvFormat.csvEscape(c)).join(','));
    acRow(
      'Account Name',
      'Type',
      'Parent Account',
      'Starting Balance ($)',
      'Cleared Balance ($)',
      'Current Balance ($)',
      'Target / Goal ($)',
      'Archived'
    );
    for (const a of snapshot.accounts) {
      const parentName = a.parentAccountId ? accountById.get(a.parentAccountId)?.name ?? '' : '';
      let clearedDelta = 0;
      let totalDelta = 0;
      for (const t of snapshot.transactions) {
        let delta = 0;
        const txType = parseTransactionType(t.type);
        if (txType === TransactionType.DEPOSIT) {
          if (t.accountId === a.id) delta = t.amount;
        } else if (txType === TransactionType.WITHDRAWAL) {
          if (t.accountId === a.id) delta = -t.amount;
        } else if (txType === TransactionType.TRANSFER) {
          if (t.accountId === a.id) delta = -t.amount;
          else if (t.toAccountId === a.id) delta = t.amount;
        }
        totalDelta += delta;
        if (t.cleared) clearedDelta += delta;
      }
      acRow(
        a.name,
        a.type,
        parentName,
        MasterCsvFormat.formatCents(a.startingBalance),
        MasterCsvFormat.formatCents(a.startingBalance + clearedDelta),
        MasterCsvFormat.formatCents(a.startingBalance + totalDelta),
        MasterCsvFormat.formatCents(a.targetAmount),
        String(a.isArchived)
      );
    }

    const budgetLines: string[] = [];
    const blRow = (...cells: string[]) =>
      budgetLines.push(cells.map((c) => MasterCsvFormat.csvEscape(c)).join(','));
    blRow(
      'Cycle',
      'Category',
      'Sub-Category',
      'Type',
      'Entered Amount ($)',
      'Entered Frequency',
      'Weekly ($)',
      'Monthly ($)',
      'Yearly ($)',
      'Cycle Total ($)',
      'Target Account / Envelope'
    );
    for (const b of snapshot.budgetItems) {
      const period = periodById.get(b.budgetPeriodId);
      const weeks = CyclePlan.safeWeeks(period?.numberOfWeeks ?? 52);
      const weekly = BudgetFrequencyMath.toWeekly(b.amount, b.frequency);
      const monthly = BudgetFrequencyMath.toMonthly(b.amount, b.frequency);
      const yearly = BudgetFrequencyMath.toYearly(b.amount, b.frequency);
      const cycleTotal = CyclePlan.cycleTotal(b.amount, b.frequency, weeks);
      const targetName = b.targetAccountId ? accountById.get(b.targetAccountId)?.name ?? '' : '';
      blRow(
        period?.name ?? b.budgetPeriodId,
        b.category,
        b.subCategory,
        b.expenseType,
        MasterCsvFormat.formatCents(b.amount),
        b.frequency,
        MasterCsvFormat.formatCents(weekly),
        MasterCsvFormat.formatCents(monthly),
        MasterCsvFormat.formatCents(yearly),
        MasterCsvFormat.formatCents(cycleTotal),
        targetName
      );
    }

    const ledgerLines: string[] = [];
    const txRow = (...cells: string[]) =>
      ledgerLines.push(cells.map((c) => MasterCsvFormat.csvEscape(c)).join(','));
    txRow(
      'Date',
      'Cycle',
      'Type',
      'Payee',
      'Category',
      'Sub-Category',
      'Amount ($)',
      'From Account',
      'To Account',
      'Cleared',
      'Tag',
      'Note'
    );
    const sortedForReport = snapshot.transactions
      .slice()
      .sort((a, b) =>
        b.date !== a.date ? compareCodeUnits(b.date, a.date) : b.createdAt - a.createdAt
      );
    for (const t of sortedForReport) {
      const periodName =
        periodById.get(t.budgetPeriodId)?.name ?? activePeriod?.name ?? '';
      const fromName = t.accountId ? accountById.get(t.accountId)?.name ?? t.accountName : t.accountName;
      const toName = t.toAccountId ? accountById.get(t.toAccountId)?.name ?? t.toAccountName : t.toAccountName;
      txRow(
        t.date,
        periodName,
        parseTransactionType(t.type),
        t.payee,
        t.category,
        t.subCategory,
        MasterCsvFormat.formatCents(t.amount),
        fromName,
        toName,
        t.cleared ? 'Cleared' : 'Pending',
        t.tag,
        t.note
      );
    }

    return {
      'overview.csv': overviewLines.join('\n') + '\n',
      'accounts_and_envelopes.csv': accountLines.join('\n') + '\n',
      'budget_lines.csv': budgetLines.join('\n') + '\n',
      'transactions_ledger.csv': ledgerLines.join('\n') + '\n'
    };
  }
};

function f(value: string | null | undefined): string {
  return MasterCsvFormat.csvEscape((value ?? '').trim());
}

function d(value: number): string {
  return MasterCsvFormat.formatDouble(value);
}

function money(cents: Cents): string {
  return MasterCsvFormat.formatCents(cents);
}

function digest(...fields: string[]): string {
  return sha256Hex(fields.join(',')).substring(0, 32);
}

/**
 * Exact 1:1 port of MasterCsvFormat.kt SyncFingerprints (lines 835-890).
 */
export const SyncFingerprints = {
  period(p: BudgetPeriod): string {
    return digest(
      f(p.id),
      f(p.name.trim() || 'Budget Cycle'),
      String(p.numberOfWeeks),
      String(p.currentWeek),
      f(p.startDate),
      f(p.endDate),
      f(p.note),
      String(p.isArchived)
    );
  },

  account(a: Account): string {
    return digest(
      f(a.id),
      f(a.name.trim() || 'Account'),
      parseAccountType(a.type),
      money(a.startingBalance),
      money(a.targetAmount),
      f(a.colorHex.trim() || '#006C4C'),
      String(a.isArchived),
      f(a.parentAccountId)
    );
  },

  category(c: CategoryEntity): string {
    return digest(
      f(c.id),
      f(c.name.trim() || 'Category'),
      f(formatCategorySubCategories(c)),
      f(c.colorHex.trim() || '#006C4C')
    );
  },

  contributor(c: Contributor): string {
    return digest(
      f(c.id),
      f(c.budgetPeriodId),
      f(c.name.trim() || 'Contributor'),
      money(c.weeklyAllowance),
      f(c.note)
    );
  },

  incomeSource(s: ContributorIncomeSource): string {
    return digest(
      f(s.id),
      f(s.contributorId),
      f(s.budgetPeriodId),
      f(s.label.trim() || 'Income'),
      money(s.weeklyAmount)
    );
  },

  allocation(al: ContributionAllocation): string {
    return digest(
      f(al.id),
      f(al.budgetPeriodId),
      f(al.contributorId),
      f(al.accountId),
      money(al.amount),
      d(al.percentage)
    );
  },

  budgetItem(b: BudgetItem): string {
    return digest(
      f(b.id),
      f(b.budgetPeriodId),
      f(b.category.trim() || 'OTHER'),
      f(b.subCategory.trim() || 'MISC'),
      money(b.amount),
      parseBudgetFrequency(b.frequency),
      f(b.targetAccountId),
      parseExpenseType(b.expenseType)
    );
  },

  transaction(t: Transaction): string {
    return digest(
      f(t.id),
      f(t.budgetPeriodId),
      f(t.accountId),
      f(t.toAccountId),
      f(t.contributorId),
      f(t.category),
      f(t.subCategory),
      money(t.amount),
      parseTransactionType(t.type),
      f(t.date),
      f(t.note),
      f(t.payee),
      f(t.tag),
      String(t.isRecurring),
      String(t.cleared),
      String(t.createdAt)
    );
  },

  recurring(r: RecurringTransaction): string {
    return digest(
      f(r.id),
      f(r.title),
      money(r.amount),
      parseTransactionType(r.type),
      f(r.accountId),
      f(r.toAccountId),
      f(r.category),
      f(r.subCategory),
      parseRecurringFrequency(r.frequency),
      f(r.startDate.trim() || r.nextDueDate),
      f(r.nextDueDate),
      String(r.active),
      String(r.cleared)
    );
  },

  incomeCalculation(ic: IncomeCalculation): string {
    return digest(
      f(ic.id),
      f(ic.contributorName),
      f(ic.source),
      money(ic.hourlyRate),
      d(ic.hoursPerWeek),
      String(ic.numberOfWeeks),
      money(ic.weeklyGross),
      money(ic.yearlyGross),
      money(ic.weeklyTax),
      money(ic.investment),
      money(ic.weeklyNet),
      money(ic.reported)
    );
  },

  snapshotFingerprints(snapshot: MasterCsvSnapshot): Record<SyncTable, Record<string, string>> {
    const mapOf = <T>(items: T[], idFn: (t: T) => string, fpFn: (t: T) => string) => {
      const rec: Record<string, string> = {};
      for (const item of items) {
        rec[idFn(item)] = fpFn(item);
      }
      return rec;
    };

    return {
      [SyncTable.PERIODS]: mapOf(snapshot.periods, (x) => x.id, SyncFingerprints.period),
      [SyncTable.ACCOUNTS]: mapOf(snapshot.accounts, (x) => x.id, SyncFingerprints.account),
      [SyncTable.CATEGORIES]: mapOf(snapshot.categories, (x) => x.id, SyncFingerprints.category),
      [SyncTable.CONTRIBUTORS]: mapOf(
        snapshot.contributors,
        (x) => x.id,
        SyncFingerprints.contributor
      ),
      [SyncTable.INCOME_SOURCES]: mapOf(
        snapshot.incomeSources,
        (x) => x.id,
        SyncFingerprints.incomeSource
      ),
      [SyncTable.ALLOCATIONS]: mapOf(
        snapshot.allocations,
        (x) => x.id,
        SyncFingerprints.allocation
      ),
      [SyncTable.BUDGET_ITEMS]: mapOf(
        snapshot.budgetItems,
        (x) => x.id,
        SyncFingerprints.budgetItem
      ),
      [SyncTable.TRANSACTIONS]: mapOf(
        snapshot.transactions,
        (x) => x.id,
        SyncFingerprints.transaction
      ),
      [SyncTable.RECURRING_TRANSACTIONS]: mapOf(
        snapshot.recurringTransactions,
        (x) => x.id,
        SyncFingerprints.recurring
      ),
      [SyncTable.INCOME_CALCULATIONS]: mapOf(
        snapshot.incomeCalculations,
        (x) => x.id,
        SyncFingerprints.incomeCalculation
      )
    };
  },

  snapshotContentFingerprint(snapshot: MasterCsvSnapshot): string {
    return MasterCsvFormat.computeBodyHash(snapshot);
  }
};
