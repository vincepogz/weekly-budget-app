import { CategoryEntity } from './models';

/**
 * Display helper matching Android's `DisplayName.of(name)`:
 * Only formats ALL-CAPS category/subcategory names for display ("LIVING EXPENSE" -> "Living Expense"),
 * while leaving any string that already contains a lowercase letter ("BofA", "iPhone", "High-Yield")
 * or no letters ("401") untouched.
 */
export function formatDisplayLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let hasLetter = false;
  let hasLower = false;
  for (const ch of trimmed) {
    if (/\p{L}/u.test(ch)) {
      hasLetter = true;
      if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) {
        hasLower = true;
      }
    }
  }
  if (!hasLetter || hasLower) return trimmed;

  let out = '';
  let startOfWord = true;
  for (const ch of trimmed) {
    if (ch === ' ' || ch === '/' || ch === '-') {
      out += ch;
      startOfWord = true;
    } else {
      out += startOfWord ? ch.toUpperCase() : ch.toLowerCase();
      startOfWord = false;
    }
  }
  return out;
}

/**
 * Preserves the user's or CSV's exact casing while trimming surrounding whitespace.
 * Never mutates "BofA", "HOA", "iPhone", "High-Yield", or "GROCERIES".
 */
export function normalizeDisplayName(raw: string): string {
  return raw.trim();
}

export const PickerLogic = {
  canonicalize(name: string, existingNames: string[]): string {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    const match = existingNames.find((c) => c.trim().toLowerCase() === lower);
    if (match) return match.trim();
    return trimmed;
  },

  mergeDistinctNames(...sources: string[][]): string[] {
    const byKey = new Map<string, string>();
    for (const list of sources) {
      for (const raw of list) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!byKey.has(key)) {
          byKey.set(key, trimmed);
        }
      }
    }
    return Array.from(byKey.values());
  },

  resolveSelectedSubCategory(currentSubCategory: string, availableSubCategories: string[]): string {
    if (!currentSubCategory) return '';
    const lower = currentSubCategory.trim().toLowerCase();
    return availableSubCategories.find((s) => s.trim().toLowerCase() === lower) ?? '';
  },

  subCategoriesForCategory(
    categoryName: string,
    categories: CategoryEntity[],
    additionalSubCategories: string[] = []
  ): string[] {
    const trimmed = categoryName.trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();
    const defined =
      categories.find((c) => c.name.trim().toLowerCase() === lower)?.subCategories ?? [];
    return PickerLogic.mergeDistinctNames(defined, additionalSubCategories);
  }
};
