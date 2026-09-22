import type { ExpenseReceipt, Prisma } from "@prisma/client";

export type ReceiptLibraryFilters = {
  dateFrom?: string;
  dateTo?: string;
  merchant?: string;
  minAmount?: number;
  maxAmount?: number;
  employeeId?: string;
  categoryId?: string;
  project?: string;
  companyCardId?: string;
  receiptNumber?: string;
  locationId?: string;
  q?: string;
};

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/**
 * Receipt search is always scoped to one business.
 * Employees who cannot view the team are pinned to their own rows even if the query names someone else.
 */
export function receiptLibraryWhere(input: {
  businessId: string;
  employeeId: string;
  viewAll: boolean;
  filters: ReceiptLibraryFilters;
}): Prisma.ExpenseWhereInput {
  const filters = input.filters;
  const q = filters.q?.trim();
  return {
    businessId: input.businessId,
    deletedAt: null,
    receipts: { some: { deletedAt: null } },
    ...(input.viewAll
      ? filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}
      : { employeeId: input.employeeId }),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.companyCardId ? { companyCardId: filters.companyCardId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.project
      ? { project: { contains: filters.project, mode: "insensitive" } }
      : {}),
    ...(filters.merchant
      ? { merchant: { contains: filters.merchant, mode: "insensitive" } }
      : {}),
    ...(filters.receiptNumber
      ? { receiptNumber: { contains: filters.receiptNumber, mode: "insensitive" } }
      : {}),
    ...(filters.minAmount != null || filters.maxAmount != null
      ? {
          total: {
            ...(filters.minAmount != null ? { gte: filters.minAmount } : {}),
            ...(filters.maxAmount != null ? { lte: filters.maxAmount } : {}),
          },
        }
      : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          purchaseDate: {
            ...(filters.dateFrom ? { gte: parseDateOnly(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: parseDateOnly(filters.dateTo) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { merchant: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
            { businessPurpose: { contains: q, mode: "insensitive" } },
            { receiptNumber: { contains: q, mode: "insensitive" } },
            { merchantAddress: { contains: q, mode: "insensitive" } },
            { ocrRawText: { contains: q, mode: "insensitive" } },
            { project: { contains: q, mode: "insensitive" } },
            { receipts: { some: { deletedAt: null, ocrText: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

export function preferredReceipt<T extends Pick<ExpenseReceipt, "role" | "kind" | "deletedAt">>(
  receipts: T[]
): T | undefined {
  const live = receipts.filter((receipt) => receipt.deletedAt == null);
  return (
    live.find((receipt) => receipt.role === "PROCESSED" && receipt.kind === "PDF") ??
    live.find((receipt) => receipt.role === "PROCESSED") ??
    live[0]
  );
}

function csvCell(value: string | number | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function receiptIndexCsv(
  rows: Array<{
    filename: string;
    date: string;
    vendor: string;
    amount: string;
    category: string;
    employee: string;
    project: string;
    digital?: string;
  }>,
  options?: { includeDigital?: boolean }
) {
  const header = ["filename", "date", "vendor", "amount", "category", "employee", "project"];
  if (options?.includeDigital) header.push("digital");
  return [header.join(","), ...rows.map((row) => header.map((key) => csvCell(row[key as keyof typeof row])).join(","))].join("\n");
}
