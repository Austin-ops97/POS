export const TAX_SUMMARY_DISCLAIMER =
  "EmeraldOne does not determine tax deductibility. Category labels are mappings your business configures.";

export type TaxLineInput = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  amountCents: number;
  hasReceipt: boolean;
};

export type TaxSummaryRow = {
  categoryId: string | null;
  category: string;
  taxLabel: string;
  count: number;
  totalCents: number;
  withReceipt: number;
  missingReceipts: number;
  ids: string[];
};

export function buildTaxSummary(
  lines: TaxLineInput[],
  mappings: { categoryId: string; taxLabel: string }[],
): TaxSummaryRow[] {
  const labels = new Map(mappings.map((mapping) => [mapping.categoryId, mapping.taxLabel.trim() || "Unmapped"]));
  const groups = new Map<string, TaxSummaryRow>();
  for (const line of lines) {
    const key = line.categoryId ?? "uncategorized";
    const existing = groups.get(key);
    const row =
      existing ??
      {
        categoryId: line.categoryId,
        category: line.categoryName ?? "Uncategorized",
        taxLabel: line.categoryId ? labels.get(line.categoryId) || "Unmapped" : "Unmapped",
        count: 0,
        totalCents: 0,
        withReceipt: 0,
        missingReceipts: 0,
        ids: [],
      };
    row.count += 1;
    row.totalCents += line.amountCents;
    if (line.hasReceipt) row.withReceipt += 1;
    row.missingReceipts = row.count - row.withReceipt;
    if (row.ids.length < 200) row.ids.push(line.id);
    groups.set(key, row);
  }
  return [...groups.values()];
}
