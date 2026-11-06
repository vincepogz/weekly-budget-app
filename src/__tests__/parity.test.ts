import { describe, expect, it } from 'vitest';
import {
  AccountType,
  BudgetFrequency,
  BudgetTotalMode,
  ExpenseType,
  RecurringFrequency,
  TransactionType
} from '../domain/models';
import { BudgetFrequencyMath, CentsMath, CyclePlan } from '../domain/cents';
import { sha256Hex, uuidNameFromBytes } from '../domain/crypto';
import { plusMonthsIso, toUtcMidnightMillis } from '../domain/localDate';
import { CyclePlanner, CycleSelection, CycleStatus } from '../domain/cyclePlanner';
import { RecurringSchedule } from '../domain/recurrence';
import { EnvelopeCoverage } from '../domain/envelopeCoverage';
import { BalanceCalculator, BudgetCalculator } from '../domain/transactionLogic';
import { MasterCsvFormat, SyncFingerprints } from '../sync/masterCsvFormat';
import { InMemorySyncFolder } from '../sync/syncFolder';
import { SyncEngine } from '../sync/syncEngine';
import {
  EMPTY_SYNC_BASE_STATE,
  MasterCsvSnapshot,
  SyncBaseState
} from '../sync/syncModels';
import { buildDefaultSeedSnapshot } from '../storage/budgetStore';

describe('Android <-> Web Domain & Sync Parity Suite', () => {
  it('parses and formats Cents with exact integer arithmetic and HALF_UP rounding', () => {
    expect(CentsMath.parse('$1,234.56')).toBe(123456);
    expect(CentsMath.parse('19.99')).toBe(1999);
    expect(CentsMath.parse('-0.50')).toBe(-50);
    expect(CentsMath.parse('1.005')).toBe(101);
    expect(CentsMath.parse('12,34')).toBe(0); // invalid comma grouping rejected
    expect(CentsMath.tryParse('12,34')).toBeNull();
    expect(CentsMath.tryParse('0')).toBe(0);
    expect(CentsMath.toPlain(123456)).toBe('1234.56');
    expect(CentsMath.toPlain(-50)).toBe('-0.50');
    expect(CentsMath.toPlain(0)).toBe('0.00');
    expect(MasterCsvFormat.formatCents(0)).toBe('0.0');
    expect(MasterCsvFormat.formatCents(1250)).toBe('12.50');
  });

  it('uses canonical Android enum strings for DEPOSIT, WITHDRAWAL, and BIWEEKLY', () => {
    expect(TransactionType.INCOME).toBe('DEPOSIT');
    expect(TransactionType.DEPOSIT).toBe('DEPOSIT');
    expect(TransactionType.EXPENSE).toBe('WITHDRAWAL');
    expect(TransactionType.WITHDRAWAL).toBe('WITHDRAWAL');
    expect(RecurringFrequency.BIWEEKLY).toBe('BIWEEKLY');
    expect(RecurringFrequency.BI_WEEKLY).toBe('BIWEEKLY');
  });

  it('converts between WEEKLY, MONTHLY, and YEARLY frequencies identically to Kotlin Cents.mulDiv', () => {
    const weekly100 = 10000; // $100.00/wk
    const monthly = BudgetFrequencyMath.toMonthly(weekly100, BudgetFrequency.WEEKLY);
    expect(monthly).toBe(43333); // Math.floorDiv(2 * 10000 * 52 + 12, 24) = 43333
    const yearly = BudgetFrequencyMath.toYearly(weekly100, BudgetFrequency.WEEKLY);
    expect(yearly).toBe(520000);
    expect(CyclePlan.cycleTotal(10000, BudgetFrequency.WEEKLY, 52)).toBe(520000);
    expect(
      CyclePlan.amountForMode(120000, BudgetFrequency.MONTHLY, BudgetTotalMode.YEAR, 52)
    ).toBe(1440000);
  });

  it('computes SHA-256 and Java UUID.nameUUIDFromBytes (UUIDv3) deterministically', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    const id1 = RecurringSchedule.deterministicTransactionId('rule-123', '2026-11-06');
    const id2 = uuidNameFromBytes('recurring|rule-123|2026-11-06');
    expect(id1).toBe(id2);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(RecurringSchedule.deterministicCreatedAt('2026-11-06')).toBe(
      toUtcMidnightMillis('2026-11-06')
    );
  });

  it('clamps LocalDate.plusMonths end-of-month dates and anchors 31st-of-month recurring rules without drift', () => {
    expect(plusMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
    expect(plusMonthsIso('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(CyclePlanner.computeEndDate('2026-01-05', 52)).toBe('2027-01-03');

    const recurringRule = {
        id: 'rule-jan31',
        title: 'Rent',
        amount: 200000,
        type: TransactionType.WITHDRAWAL,
        accountId: 'acc-1',
        toAccountId: null,
        category: 'HOUSING',
        subCategory: 'RENT',
        frequency: RecurringFrequency.MONTHLY,
        startDate: '2026-01-31',
        nextDueDate: '2026-01-31',
        active: true,
        cleared: true
      };
    expect(RecurringSchedule.dueDates(recurringRule, '2026-04-01')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31'
    ]);
    expect(RecurringSchedule.nextDueAfter(recurringRule, '2026-03-31')).toBe('2026-04-30');
  });

  it('classifies and partitions cycles into Current, Upcoming, and Past', () => {
    const cycles = [
      {
        id: 'p-past',
        name: '2025 Budget',
        startDate: '2025-01-06',
        endDate: '2026-01-04',
        numberOfWeeks: 52,
        currentWeek: 52,
        isCurrent: false,
        isArchived: false
      },
      {
        id: 'p-curr',
        name: '2026 Budget',
        startDate: '2026-01-05',
        endDate: '2027-01-03',
        numberOfWeeks: 52,
        currentWeek: 44,
        isCurrent: true,
        isArchived: false
      },
      {
        id: 'p-next',
        name: '2027 Budget',
        startDate: '2027-01-04',
        endDate: '2028-01-02',
        numberOfWeeks: 52,
        currentWeek: 1,
        isCurrent: false,
        isArchived: false
      }
    ];
    const groups = CycleSelection.partitionForPicker(cycles, '2026-11-06');
    expect(groups.current?.id).toBe('p-curr');
    expect(groups.upcoming.map((c) => c.id)).toEqual(['p-next']);
    expect(groups.past.map((c) => c.id)).toEqual(['p-past']);
    expect(CycleSelection.classify(cycles[0], '2026-11-06')).toBe(CycleStatus.PAST);
  });

  it('encodes and decodes MasterCsvFormat v3 with multiline notes, comma sub_categories, preserved casing, and verified content_hash', () => {
    const seed = buildDefaultSeedSnapshot();
    const periodId = seed.periods[0].id;
    const accountId = seed.accounts[0].id;
    const categoryId = seed.categories[0].id;
    seed.periods[0].note = 'Line 1 of cycle note\nLine 2 with "quotes", and comma';
    seed.accounts[0].name = 'BofA High-Yield';
    seed.categories[0].name = 'HOA & Housing';
    seed.categories[0].subCategories = ['Rent', 'HOA', 'Home Insurance'];

    const encoded = MasterCsvFormat.encode(seed, {
      revision: 5,
      writtenByDeviceId: 'test-device',
      ancestorHashes: ['abc12345']
    });
    expect(encoded.csvText).toContain('#TABLE,meta');
    expect(encoded.csvText).toContain('format_version,3');
    expect(encoded.csvText).toContain('sync_protocol,3');
    expect(encoded.csvText).toContain('"Rent, HOA, Home Insurance"');

    const decoded = MasterCsvFormat.decode(encoded.csvText, true);
    expect(decoded.metadata.revision).toBe(5);
    expect(decoded.metadata.contentHash).toBe(encoded.metadata.contentHash);
    expect(decoded.snapshot.periods.find((period) => period.id === periodId)?.note).toBe(
      'Line 1 of cycle note\nLine 2 with "quotes", and comma'
    );
    expect(decoded.snapshot.accounts.find((account) => account.id === accountId)?.name).toBe(
      'BofA High-Yield'
    );
    const decodedCategory = decoded.snapshot.categories.find(
      (category) => category.id === categoryId
    );
    expect(decodedCategory?.name).toBe('HOA & Housing');
    expect(decodedCategory?.subCategories).toEqual([
      'Rent',
      'HOA',
      'Home Insurance'
    ]);

    const fpBefore = SyncFingerprints.snapshotContentFingerprint(seed);
    const fpAfter = SyncFingerprints.snapshotContentFingerprint(decoded.snapshot);
    expect(fpAfter).toBe(fpBefore);
  });

  it('computes envelope allocations, available balances, and cover transfers accurately', () => {
    const seed = buildDefaultSeedSnapshot();
    const periodId = seed.periods[0].id;
    const checking = seed.accounts.find((a) => a.type === AccountType.CHECKING)!;
    const envelope = seed.accounts.find(
      (a) => a.type === AccountType.ENVELOPE && a.parentAccountId === checking.id
    )!;

    checking.startingBalance = 200_000; // $2,000.00
    envelope.startingBalance = 50_000; // $500.00 allocated in child envelope

    const expenseTx = {
      id: 'tx-1',
      budgetPeriodId: periodId,
      accountId: checking.id,
      accountName: checking.name,
      toAccountId: null,
      toAccountName: '',
      contributorId: null,
      category: 'Transportation',
      subCategory: 'Service & Repairs',
      amount: 30_000, // $300.00 repair
      type: TransactionType.EXPENSE,
      date: '2026-11-06',
      note: 'Brake pads',
      payee: 'Auto Shop',
      tag: '',
      isRecurring: false,
      cleared: true,
      syncedToMasterSheet: false,
      createdAt: 1700000000000
    };

    const coverTx = EnvelopeCoverage.buildCoverTransaction({
      budgetPeriodId: periodId,
      envelope,
      destination: checking,
      category: 'Transportation',
      subCategory: 'Service & Repairs',
      amount: 30_000,
      date: '2026-11-06'
    });

    const balances = BalanceCalculator.computeAll(seed.accounts, [
      expenseTx,
      coverTx
    ]);
    const checkingBal = balances.find((b) => b.account.id === checking.id)!;
    const envBal = balances.find((b) => b.account.id === envelope.id)!;

    // Envelope started at $500, transferred $300 out -> $200 remaining
    expect(envBal.currentBalance).toBe(20_000);
    // Checking started at $2,000, spent $300, received $300 cover transfer -> $2,000 current, minus $200 in child envelope = $1,800 available
    expect(checkingBal.currentBalance).toBe(200_000);
    expect(checkingBal.availableBalance).toBe(180_000);

    const budgetItem = {
      id: 'bi-1',
      budgetPeriodId: periodId,
      category: 'Transportation',
      subCategory: 'Service & Repairs',
      amount: 10_000,
      frequency: BudgetFrequency.MONTHLY,
      targetAccountId: null,
      expenseType: ExpenseType.VARIABLE
    };
    const progress = BudgetCalculator.summarize(
      periodId,
      52,
      [budgetItem],
      [expenseTx, coverTx]
    );
    expect(progress.totalActualSpent).toBe(30_000);
    expect(progress.totalCoveredFromEnvelope).toBe(30_000);
    expect(progress.totalNetOutOfBudget).toBe(0);
  });

  it('converges across Phone and Web edits via SyncEngine and ThreeWayMerge', async () => {
    const folder = new InMemorySyncFolder('Shared Drive Folder');
    let phoneSnap: MasterCsvSnapshot = buildDefaultSeedSnapshot();
    let phoneBase: SyncBaseState = { ...EMPTY_SYNC_BASE_STATE };

    const phoneEngine = new SyncEngine(
      async () => phoneSnap,
      async (s) => {
        phoneSnap = s;
      },
      async () => phoneBase,
      async (b) => {
        phoneBase = b;
      },
      async () => {
        phoneBase = { ...EMPTY_SYNC_BASE_STATE };
      },
      async () => 'android-phone'
    );

    // 1. Phone seeds initial Master CSV to shared folder
    const seedOutcome = await phoneEngine.sync(folder);
    expect(seedOutcome.kind).toBe('Success');

    // 2. Web links to the same folder with starter seed data and adopts remote data without a false conflict prompt
    let webSnap: MasterCsvSnapshot = buildDefaultSeedSnapshot();
    let webBase: SyncBaseState = { ...EMPTY_SYNC_BASE_STATE };
    const webEngine = new SyncEngine(
      async () => webSnap,
      async (s) => {
        webSnap = s;
      },
      async () => webBase,
      async (b) => {
        webBase = b;
      },
      async () => {
        webBase = { ...EMPTY_SYNC_BASE_STATE };
      },
      async () => 'web-github-pages'
    );

    const webAdopt = await webEngine.sync(folder);
    expect(webAdopt.kind).toBe('Success');
    expect(webSnap.periods[0].id).toBe(phoneSnap.periods[0].id);

    // 3. Phone adds transaction A while Web adds transaction B concurrently
    const periodId = phoneSnap.periods[0].id;
    const checking = phoneSnap.accounts[0];
    phoneSnap = {
      ...phoneSnap,
      transactions: [
        ...phoneSnap.transactions,
        {
          id: 'tx-phone-a',
          budgetPeriodId: periodId,
          accountId: checking.id,
          accountName: checking.name,
          toAccountId: null,
          toAccountName: '',
          contributorId: null,
          category: 'Groceries',
          subCategory: 'Supermarket',
          amount: 4500,
          type: TransactionType.EXPENSE,
          date: '2026-11-06',
          note: 'Phone grocery trip',
          payee: 'Trader Joes',
          tag: '',
          isRecurring: false,
          cleared: true,
          syncedToMasterSheet: false,
          createdAt: 1700000001000
        }
      ]
    };

    webSnap = {
      ...webSnap,
      transactions: [
        ...webSnap.transactions,
        {
          id: 'tx-web-b',
          budgetPeriodId: periodId,
          accountId: checking.id,
          accountName: checking.name,
          toAccountId: null,
          toAccountName: '',
          contributorId: null,
          category: 'Dining Out',
          subCategory: 'Coffee & Cafes',
          amount: 650,
          type: TransactionType.EXPENSE,
          date: '2026-11-06',
          note: 'Web coffee',
          payee: 'Blue Bottle',
          tag: '',
          isRecurring: false,
          cleared: true,
          syncedToMasterSheet: false,
          createdAt: 1700000002000
        }
      ]
    };

    const phonePush = await phoneEngine.sync(folder);
    expect(phonePush.kind).toBe('Success');

    const webMerge = await webEngine.sync(folder);
    expect(
      webMerge.kind,
      webMerge.kind === 'NeedsAttention' ? webMerge.message : 'Expected a successful merge'
    ).toBe('Success');
    if (webMerge.kind === 'Success') {
      expect(webMerge.summary.direction).toBe('MERGED');
    }

    // Both transactions must be present on Web now
    expect(webSnap.transactions.map((t) => t.id).sort()).toEqual([
      'tx-phone-a',
      'tx-web-b'
    ]);

    // Phone pulls the merged result
    const phonePull = await phoneEngine.sync(folder);
    expect(phonePull.kind).toBe('Success');
    expect(phoneSnap.transactions.map((t) => t.id).sort()).toEqual([
      'tx-phone-a',
      'tx-web-b'
    ]);

    // Subsequent sync on both sides is a strict NO_OP
    const finalWebSync = await webEngine.sync(folder);
    expect(finalWebSync.kind).toBe('Success');
    if (finalWebSync.kind === 'Success') {
      expect(finalWebSync.summary.direction).toBe('NO_OP');
    }
  });
});
