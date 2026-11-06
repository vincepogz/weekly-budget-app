import {
  Account,
  AccountType,
  BudgetItem,
  Cents,
  Transaction,
  TransactionType,
  isDebtAccountType
} from './models';
import { BudgetFrequencyMath, CyclePlan } from './cents';

export type TransactionValidationResult =
  | { valid: true }
  | { valid: false; message: string };

export const TransactionValidator = {
  validate(params: {
    amount: Cents;
    type: TransactionType;
    accountId: string | null;
    toAccountId: string | null;
    category: string;
    date: string;
  }): TransactionValidationResult {
    if (params.amount <= 0) {
      return { valid: false, message: 'Amount must be greater than $0.00.' };
    }
    if (!params.date.trim()) {
      return { valid: false, message: 'Please pick a transaction date.' };
    }
    if (!params.accountId) {
      return {
        valid: false,
        message:
          params.type === TransactionType.TRANSFER
            ? 'Please choose a source account for the transfer.'
            : 'Please choose an account.'
      };
    }
    if (params.type === TransactionType.TRANSFER) {
      if (!params.toAccountId) {
        return { valid: false, message: 'Please choose a destination account for the transfer.' };
      }
      if (params.toAccountId === params.accountId) {
        return { valid: false, message: 'Source and destination accounts must be different.' };
      }
    } else if (!params.category.trim()) {
      return { valid: false, message: 'Please enter or select a category.' };
    }
    return { valid: true };
  }
};

export interface AccountBalanceDetail {
  account: Account;
  starting: Cents;
  inflows: Cents;
  outflows: Cents;
  transfersIn: Cents;
  transfersOut: Cents;
  clearedBalance: Cents;
  unclearedDelta: Cents;
  currentBalance: Cents;
  allocatedToEnvelopes: Cents;
  availableBalance: Cents;
  transactionCount: number;
  isOverdrawn: boolean;
}

export function getTargetProgress(detail: AccountBalanceDetail): number {
  const target = detail.account.targetAmount;
  if (target <= 0) return 0;
  if (isDebtAccountType(detail.account.type)) {
    const paid = target - Math.max(0, detail.currentBalance);
    return Math.min(1, Math.max(0, paid / target));
  }
  return Math.min(1, Math.max(0, detail.currentBalance / target));
}

export const BalanceCalculator = {
  computeAll(
    accounts: Account[],
    transactions: Transaction[],
    includeArchived = false
  ): AccountBalanceDetail[] {
    const visible = includeArchived ? accounts : accounts.filter((a) => !a.isArchived);
    const inflows = new Map<string, Cents>();
    const outflows = new Map<string, Cents>();
    const transfersIn = new Map<string, Cents>();
    const transfersOut = new Map<string, Cents>();
    const clearedDelta = new Map<string, Cents>();
    const unclearedDelta = new Map<string, Cents>();
    const count = new Map<string, number>();

    const add = (map: Map<string, Cents>, key: string | null, delta: Cents) => {
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + delta);
    };

    const bumpCount = (key: string | null) => {
      if (!key) return;
      count.set(key, (count.get(key) ?? 0) + 1);
    };

    const accountTypeById = new Map<string, AccountType>();
    for (const acc of accounts) {
      accountTypeById.set(acc.id, acc.type);
    }

    const signedDelta = (accountId: string | null, cashFlowSign: number, amount: Cents): Cents => {
      if (!accountId) return 0;
      const type = accountTypeById.get(accountId);
      const isDebt = type !== undefined && isDebtAccountType(type);
      const multiplier = isDebt ? -cashFlowSign : cashFlowSign;
      return amount * multiplier;
    };

    for (const tx of transactions) {
      const targetMap = tx.cleared ? clearedDelta : unclearedDelta;
      switch (tx.type) {
        case TransactionType.INCOME:
          add(inflows, tx.accountId, tx.amount);
          add(targetMap, tx.accountId, signedDelta(tx.accountId, +1, tx.amount));
          bumpCount(tx.accountId);
          break;
        case TransactionType.EXPENSE:
          add(outflows, tx.accountId, tx.amount);
          add(targetMap, tx.accountId, signedDelta(tx.accountId, -1, tx.amount));
          bumpCount(tx.accountId);
          break;
        case TransactionType.TRANSFER:
          add(transfersOut, tx.accountId, tx.amount);
          add(transfersIn, tx.toAccountId, tx.amount);
          add(targetMap, tx.accountId, signedDelta(tx.accountId, -1, tx.amount));
          add(targetMap, tx.toAccountId, signedDelta(tx.toAccountId, +1, tx.amount));
          bumpCount(tx.accountId);
          if (tx.toAccountId !== tx.accountId) {
            bumpCount(tx.toAccountId);
          }
          break;
      }
    }

    const rawCurrentById = new Map<string, Cents>();
    for (const account of visible) {
      const starting = account.startingBalance;
      const cleared = starting + (clearedDelta.get(account.id) ?? 0);
      const uncleared = unclearedDelta.get(account.id) ?? 0;
      rawCurrentById.set(account.id, cleared + uncleared);
    }

    const allocatedByParent = new Map<string, Cents>();
    for (const account of visible) {
      if (account.type === AccountType.ENVELOPE && account.parentAccountId) {
        const childCurrent = Math.max(0, rawCurrentById.get(account.id) ?? 0);
        allocatedByParent.set(
          account.parentAccountId,
          (allocatedByParent.get(account.parentAccountId) ?? 0) + childCurrent
        );
      }
    }

    return visible.map((account) => {
      const starting = account.startingBalance;
      const cleared = starting + (clearedDelta.get(account.id) ?? 0);
      const uncleared = unclearedDelta.get(account.id) ?? 0;
      const current = cleared + uncleared;
      const allocated = allocatedByParent.get(account.id) ?? 0;
      const available =
        account.type === AccountType.CHECKING || account.type === AccountType.SAVINGS
          ? current - allocated
          : current;
      const isOverdrawn = isDebtAccountType(account.type) ? false : available < 0;

      return {
        account,
        starting,
        inflows: inflows.get(account.id) ?? 0,
        outflows: outflows.get(account.id) ?? 0,
        transfersIn: transfersIn.get(account.id) ?? 0,
        transfersOut: transfersOut.get(account.id) ?? 0,
        clearedBalance: cleared,
        unclearedDelta: uncleared,
        currentBalance: current,
        allocatedToEnvelopes: allocated,
        availableBalance: available,
        transactionCount: count.get(account.id) ?? 0,
        isOverdrawn
      };
    });
  }
};

export interface CategoryActual {
  category: string;
  plannedWeekly: Cents;
  plannedCycle: Cents;
  actualSpent: Cents;
  coveredFromEnvelope: Cents;
  netOutOfBudget: Cents;
  transactionCount: number;
  remainingCycle: Cents;
  utilizationRatio: number;
  isOverBudget: boolean;
}

export interface BudgetProgressSummary {
  totalPlannedWeekly: Cents;
  totalPlannedCycle: Cents;
  totalActualSpent: Cents;
  totalCoveredFromEnvelope: Cents;
  totalNetOutOfBudget: Cents;
  totalActualIncome: Cents;
  netCashFlowActual: Cents;
  byCategory: CategoryActual[];
  unplannedCategories: CategoryActual[];
}

export const BudgetCalculator = {
  summarize(
    periodId: string,
    numberOfWeeks: number,
    budgetItems: BudgetItem[],
    transactions: Transaction[]
  ): BudgetProgressSummary {
    const safeWeeks = Math.max(1, numberOfWeeks);
    const periodItems = budgetItems.filter((b) => b.budgetPeriodId === periodId);
    const periodTx = transactions.filter((t) => t.budgetPeriodId === periodId);

    const itemsByCat = new Map<string, { displayName: string; items: BudgetItem[] }>();
    for (const item of periodItems) {
      const trimmed = item.category.trim();
      const key = trimmed.toLowerCase();
      const existing = itemsByCat.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        itemsByCat.set(key, { displayName: trimmed, items: [item] });
      }
    }

    const plannedWeeklyByCat = new Map<string, Cents>();
    const plannedCycleByCat = new Map<string, Cents>();
    for (const [key, entry] of itemsByCat.entries()) {
      let wSum = 0;
      let cSum = 0;
      for (const item of entry.items) {
        wSum += BudgetFrequencyMath.toWeekly(item.amount, item.frequency);
        cSum += CyclePlan.cycleTotal(item.amount, item.frequency, safeWeeks);
      }
      plannedWeeklyByCat.set(key, wSum);
      plannedCycleByCat.set(key, cSum);
    }

    const expensesTx = periodTx.filter((t) => t.type === TransactionType.EXPENSE);
    const actualByCat = new Map<string, { displayName: string; sum: Cents; count: number }>();
    for (const tx of expensesTx) {
      const trimmed = tx.category.trim() || 'Uncategorized';
      const key = trimmed.toLowerCase();
      const existing = actualByCat.get(key);
      if (existing) {
        existing.sum += tx.amount;
        existing.count += 1;
      } else {
        actualByCat.set(key, { displayName: trimmed, sum: tx.amount, count: 1 });
      }
    }

    const coveredByCat = new Map<string, Cents>();
    for (const tx of periodTx) {
      if (
        tx.type === TransactionType.TRANSFER &&
        tx.tag.trim().toLowerCase() === 'cover' &&
        tx.category.trim().length > 0
      ) {
        const key = tx.category.trim().toLowerCase();
        coveredByCat.set(key, (coveredByCat.get(key) ?? 0) + tx.amount);
      }
    }

    const buildCategoryActual = (
      category: string,
      plannedWeekly: Cents,
      plannedCycle: Cents,
      actualSpent: Cents,
      coveredFromEnvelope: Cents,
      transactionCount: number
    ): CategoryActual => {
      const netOutOfBudget = Math.max(0, actualSpent - coveredFromEnvelope);
      const remainingCycle = plannedCycle - netOutOfBudget;
      const utilizationRatio = plannedCycle > 0 ? netOutOfBudget / plannedCycle : actualSpent > 0 ? 1 : 0;
      const isOverBudget = plannedCycle > 0 ? netOutOfBudget > plannedCycle : actualSpent > 0;
      return {
        category,
        plannedWeekly,
        plannedCycle,
        actualSpent,
        coveredFromEnvelope,
        netOutOfBudget,
        transactionCount,
        remainingCycle,
        utilizationRatio,
        isOverBudget
      };
    };

    const plannedList: CategoryActual[] = [];
    for (const [key, entry] of itemsByCat.entries()) {
      const actual = actualByCat.get(key);
      const covered = coveredByCat.get(key) ?? 0;
      plannedList.push(
        buildCategoryActual(
          entry.displayName,
          plannedWeeklyByCat.get(key) ?? 0,
          plannedCycleByCat.get(key) ?? 0,
          actual?.sum ?? 0,
          covered,
          actual?.count ?? 0
        )
      );
    }
    plannedList.sort((a, b) => b.plannedWeekly - a.plannedWeekly);

    const unplannedList: CategoryActual[] = [];
    for (const [key, actual] of actualByCat.entries()) {
      if (itemsByCat.has(key)) continue;
      const covered = coveredByCat.get(key) ?? 0;
      unplannedList.push(
        buildCategoryActual(actual.displayName, 0, 0, actual.sum, covered, actual.count)
      );
    }
    unplannedList.sort((a, b) => b.actualSpent - a.actualSpent);

    const totalPlannedWeekly = Array.from(plannedWeeklyByCat.values()).reduce((a, b) => a + b, 0);
    const totalPlannedCycle = Array.from(plannedCycleByCat.values()).reduce((a, b) => a + b, 0);
    const totalActualSpent = expensesTx.reduce((a, t) => a + t.amount, 0);
    const totalCoveredFromEnvelope = Array.from(coveredByCat.values()).reduce((a, b) => a + b, 0);
    const totalNetOutOfBudget = [...plannedList, ...unplannedList].reduce(
      (a, c) => a + c.netOutOfBudget,
      0
    );
    const totalActualIncome = periodTx
      .filter((t) => t.type === TransactionType.INCOME)
      .reduce((a, t) => a + t.amount, 0);

    return {
      totalPlannedWeekly,
      totalPlannedCycle,
      totalActualSpent,
      totalCoveredFromEnvelope,
      totalNetOutOfBudget,
      totalActualIncome,
      netCashFlowActual: totalActualIncome - totalActualSpent,
      byCategory: plannedList,
      unplannedCategories: unplannedList
    };
  }
};
