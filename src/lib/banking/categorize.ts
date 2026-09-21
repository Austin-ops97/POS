import { CATEGORY_KEYWORDS, normalizeVendorName } from "@/lib/expenses/constants";

export type CategoryRule = {
  pattern: string;
  categoryId: string;
  categoryName: string;
};

export type CategorySuggestion = {
  categoryId: string | null;
  categoryName: string | null;
  reason: string | null;
  /** True only for a saved business rule. Keyword hits stay suggestions. */
  applied: boolean;
};

export function suggestCategory(input: {
  merchant: string | null;
  description: string;
  rules: CategoryRule[];
  categoriesByName: Record<string, string>;
}): CategorySuggestion {
  const haystack = normalizeVendorName(`${input.merchant ?? ""} ${input.description}`);
  const rule = input.rules.find((item) => item.pattern && haystack.includes(normalizeVendorName(item.pattern)));
  if (rule) {
    return {
      categoryId: rule.categoryId,
      categoryName: rule.categoryName,
      reason: `Saved rule “${rule.pattern}”`,
      applied: true,
    };
  }

  let best: { name: string; keyword: string } | null = null;
  for (const [name, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (!keyword || !haystack.includes(keyword)) continue;
      if (!best || keyword.length > best.keyword.length) best = { name, keyword };
    }
  }
  if (!best) {
    return { categoryId: null, categoryName: null, reason: null, applied: false };
  }
  return {
    categoryId: input.categoriesByName[best.name] ?? null,
    categoryName: best.name,
    reason: `Suggested from “${best.keyword}”`,
    applied: false,
  };
}

export function assertSplitsBalance(parentCents: number, partCents: number[]): void {
  const sum = partCents.reduce((total, part) => total + part, 0);
  if (sum !== Math.abs(parentCents)) {
    throw new Error("Invalid split: amounts must add up to the transaction");
  }
}
