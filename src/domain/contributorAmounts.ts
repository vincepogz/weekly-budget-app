import {
  BudgetFrequency,
  CategoryEntity,
  Cents,
  Contributor,
  ContributorIncomeSource,
  Transaction,
  TransactionType
} from './models';
import { BudgetFrequencyMath } from './cents';

export const ContributorAmounts = {
  convertFrequency(
    rawInput: string,
    from: BudgetFrequency,
    to: BudgetFrequency,
    parseCents: (raw: string) => Cents,
    formatPlain: (cents: Cents) => string
  ): string {
    if (from === to) return rawInput;
    const trimmed = rawInput.trim();
    if (!trimmed) return rawInput;
    const cents = parseCents(trimmed);
    if (cents <= 0) return rawInput;
    const converted = BudgetFrequencyMath.convert(cents, from, to);
    return formatPlain(converted);
  },

  effectiveIncomeForPeriod(
    periodId: string,
    contributors: Contributor[],
    incomeSources: ContributorIncomeSource[]
  ): Map<string, Cents> {
    const sourcesByContributor = new Map<string, ContributorIncomeSource[]>();
    for (const s of incomeSources) {
      if (s.budgetPeriodId !== periodId) continue;
      const list = sourcesByContributor.get(s.contributorId) ?? [];
      list.push(s);
      sourcesByContributor.set(s.contributorId, list);
    }

    const out = new Map<string, Cents>();
    for (const c of contributors) {
      if (c.budgetPeriodId !== periodId) continue;
      const sources = sourcesByContributor.get(c.id);
      if (sources && sources.length > 0) {
        const sum = sources.reduce((acc, s) => acc + s.weeklyAmount, 0);
        out.set(c.id, sum);
      } else {
        out.set(c.id, c.weeklyAllowance);
      }
    }
    return out;
  },

  remainingAfterContributions(
    effectiveWeeklyIncome: Cents,
    allocatedWeeklySum: Cents
  ): { remainingWeekly: Cents; isOverAllocated: boolean; overAllocatedByWeekly: Cents } {
    const diff = effectiveWeeklyIncome - allocatedWeeklySum;
    return {
      remainingWeekly: diff,
      isOverAllocated: diff < 0,
      overAllocatedByWeekly: diff < 0 ? -diff : 0
    };
  }
};

export interface TransactionSuggestionIndex {
  payees: string[];
  categories: string[];
  subCategoriesByCategory: Map<string, string[]>;
  tags: string[];
  notes: string[];
  payeeLastCategory: Map<string, { category: string; subCategory: string }>;
  categoryTopPayees: Map<string, string[]>;
  categoryTopAmounts: Map<string, Cents[]>;
}

export const TransactionSuggestions = {
  fromHistory(
    transactions: Transaction[],
    definedCategories: CategoryEntity[] = [],
    maxPerField = 25
  ): TransactionSuggestionIndex {
    const sorted = transactions
      .slice()
      .sort((a, b) => (b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt));

    const payees = new Map<string, string>();
    const categories = new Map<string, string>();
    const subByCat = new Map<string, Map<string, string>>();
    const tags = new Map<string, string>();
    const notes = new Map<string, string>();
    const payeeLastCategory = new Map<string, { category: string; subCategory: string }>();
    const categoryPayeeCounts = new Map<string, Map<string, { display: string; count: number }>>();
    const categoryAmountCounts = new Map<string, Map<Cents, number>>();

    for (const cat of definedCategories) {
      const catTrim = cat.name.trim();
      if (!catTrim) continue;
      const catKey = catTrim.toLowerCase();
      if (!categories.has(catKey)) categories.set(catKey, catTrim);
      const subMap = subByCat.get(catKey) ?? new Map<string, string>();
      for (const sub of cat.subCategories) {
        const subTrim = sub.trim();
        if (subTrim && !subMap.has(subTrim.toLowerCase())) {
          subMap.set(subTrim.toLowerCase(), subTrim);
        }
      }
      subByCat.set(catKey, subMap);
    }

    for (const tx of sorted) {
      const payeeTrim = tx.payee.trim();
      const catTrim = tx.category.trim();
      const subTrim = tx.subCategory.trim();
      const tagTrim = tx.tag.trim();
      const noteTrim = tx.note.trim();

      if (payeeTrim && payees.size < maxPerField) {
        const key = payeeTrim.toLowerCase();
        if (!payees.has(key)) payees.set(key, payeeTrim);
      }
      if (catTrim && categories.size < maxPerField) {
        const key = catTrim.toLowerCase();
        if (!categories.has(key)) categories.set(key, catTrim);
      }
      if (catTrim && subTrim) {
        const catKey = catTrim.toLowerCase();
        const subMap = subByCat.get(catKey) ?? new Map<string, string>();
        if (!subMap.has(subTrim.toLowerCase())) {
          subMap.set(subTrim.toLowerCase(), subTrim);
        }
        subByCat.set(catKey, subMap);
      }
      if (tagTrim && tagTrim.toLowerCase() !== 'cover' && tags.size < maxPerField) {
        const key = tagTrim.toLowerCase();
        if (!tags.has(key)) tags.set(key, tagTrim);
      }
      if (noteTrim && notes.size < maxPerField) {
        const key = noteTrim.toLowerCase();
        if (!notes.has(key)) notes.set(key, noteTrim);
      }
      if (payeeTrim && catTrim && tx.type !== TransactionType.TRANSFER) {
        const pKey = payeeTrim.toLowerCase();
        if (!payeeLastCategory.has(pKey)) {
          payeeLastCategory.set(pKey, { category: catTrim, subCategory: subTrim });
        }
      }
      if (catTrim && payeeTrim) {
        const cKey = catTrim.toLowerCase();
        const pKey = payeeTrim.toLowerCase();
        const pMap = categoryPayeeCounts.get(cKey) ?? new Map();
        const existing = pMap.get(pKey);
        pMap.set(pKey, { display: existing?.display ?? payeeTrim, count: (existing?.count ?? 0) + 1 });
        categoryPayeeCounts.set(cKey, pMap);
      }
      if (catTrim && tx.amount > 0) {
        const cKey = catTrim.toLowerCase();
        const aMap = categoryAmountCounts.get(cKey) ?? new Map<Cents, number>();
        aMap.set(tx.amount, (aMap.get(tx.amount) ?? 0) + 1);
        categoryAmountCounts.set(cKey, aMap);
      }
    }

    const subCategoriesByCategory = new Map<string, string[]>();
    for (const [k, v] of subByCat.entries()) {
      subCategoriesByCategory.set(k, Array.from(v.values()));
    }

    const categoryTopPayees = new Map<string, string[]>();
    for (const [cKey, pMap] of categoryPayeeCounts.entries()) {
      const top = Array.from(pMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map((x) => x.display);
      categoryTopPayees.set(cKey, top);
    }

    const categoryTopAmounts = new Map<string, Cents[]>();
    for (const [cKey, aMap] of categoryAmountCounts.entries()) {
      const top = Array.from(aMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map((x) => x[0]);
      categoryTopAmounts.set(cKey, top);
    }

    return {
      payees: Array.from(payees.values()),
      categories: Array.from(categories.values()),
      subCategoriesByCategory,
      tags: Array.from(tags.values()),
      notes: Array.from(notes.values()),
      payeeLastCategory,
      categoryTopPayees,
      categoryTopAmounts
    };
  },

  suggestCategoryForPayee(
    index: TransactionSuggestionIndex,
    payee: string
  ): { category: string; subCategory: string } | null {
    const key = payee.trim().toLowerCase();
    if (!key) return null;
    return index.payeeLastCategory.get(key) ?? null;
  }
};
