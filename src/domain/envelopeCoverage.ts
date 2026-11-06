import { Account, BudgetItem, Cents, Transaction, TransactionType } from './models';
import { randomUuid } from './crypto';
import { todayIso } from './localDate';

export interface CoverSummary {
  transactionId: string;
  envelopeAccountId: string | null;
  envelopeName: string;
  destinationAccountId: string | null;
  destinationName: string;
  category: string;
  subCategory: string;
  amount: Cents;
  date: string;
  note: string;
}

export const EnvelopeCoverage = {
  COVER_TAG: 'cover',

  parse(tx: Transaction): CoverSummary | null {
    if (tx.type !== TransactionType.TRANSFER) return null;
    if (tx.tag.trim().toLowerCase() !== EnvelopeCoverage.COVER_TAG) return null;
    const category = tx.category.trim();
    if (!category) return null;
    return {
      transactionId: tx.id,
      envelopeAccountId: tx.accountId,
      envelopeName: tx.accountName,
      destinationAccountId: tx.toAccountId,
      destinationName: tx.toAccountName,
      category,
      subCategory: tx.subCategory.trim(),
      amount: tx.amount,
      date: tx.date,
      note: tx.note
    };
  },

  isCoverTransfer(tx: Transaction): boolean {
    return EnvelopeCoverage.parse(tx) !== null;
  },

  coveredByLineInCycle(
    budgetPeriodId: string,
    transactions: Transaction[]
  ): Map<string, Cents> {
    const out = new Map<string, Cents>();
    for (const tx of transactions) {
      if (tx.budgetPeriodId !== budgetPeriodId) continue;
      const summary = EnvelopeCoverage.parse(tx);
      if (!summary) continue;
      const key = `${summary.category.toLowerCase()}||${summary.subCategory.toLowerCase()}`;
      out.set(key, (out.get(key) ?? 0) + summary.amount);
    }
    return out;
  },

  coveredForBudgetItem(
    item: BudgetItem,
    coveredByLine: Map<string, Cents>,
    itemsInCategory: number
  ): Cents {
    const catKey = item.category.trim().toLowerCase();
    const subKey = item.subCategory.trim().toLowerCase();
    const exact = coveredByLine.get(`${catKey}||${subKey}`) ?? 0;
    if (subKey.length > 0 && itemsInCategory === 1) {
      const categoryLevel = coveredByLine.get(`${catKey}||`) ?? 0;
      return exact + categoryLevel;
    }
    return exact;
  },

  buildCoverTransaction(params: {
    budgetPeriodId: string;
    envelope: Account;
    destination: Account;
    category: string;
    subCategory?: string;
    amount: Cents;
    date?: string;
    note?: string;
    cleared?: boolean;
    nowMillis?: number;
  }): Transaction {
    const cleanCategory = params.category.trim();
    const cleanSub = (params.subCategory ?? '').trim();
    if (!cleanCategory) {
      throw new Error('Cover transfer requires a non-blank budget category.');
    }
    if (params.amount <= 0) {
      throw new Error('Cover transfer amount must be greater than zero.');
    }
    if (params.envelope.id === params.destination.id) {
      throw new Error('Envelope and destination account must be different.');
    }
    const defaultNote = cleanSub
      ? `Cover ${cleanCategory} · ${cleanSub} from ${params.envelope.name}`
      : `Cover ${cleanCategory} from ${params.envelope.name}`;
    const trimmedNote = (params.note ?? '').trim();

    return {
      id: randomUuid(),
      budgetPeriodId: params.budgetPeriodId,
      accountId: params.envelope.id,
      accountName: params.envelope.name,
      toAccountId: params.destination.id,
      toAccountName: params.destination.name,
      contributorId: null,
      category: cleanCategory,
      subCategory: cleanSub,
      amount: params.amount,
      type: TransactionType.TRANSFER,
      date: (params.date ?? '').trim() || todayIso(),
      note: trimmedNote || defaultNote,
      payee: `${params.envelope.name} → ${params.destination.name}`,
      tag: EnvelopeCoverage.COVER_TAG,
      isRecurring: false,
      cleared: params.cleared ?? true,
      syncedToMasterSheet: false,
      createdAt: params.nowMillis ?? Date.now()
    };
  }
};
