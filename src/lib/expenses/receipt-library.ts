import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { canViewAllExpenses } from "./expense-service";
import { readReceiptBlob } from "@/lib/storage/receipt-storage";
import { receiptDownloadName } from "./reconciliation";
import {
  RECEIPT_ARCHIVE_MAX_BYTES,
  RECEIPT_ARCHIVE_MAX_FILES,
  assembleReceiptArchive,
  receiptArchiveSizeError,
  type ReceiptArchiveEntry,
} from "./receipt-archive";
import {
  preferredReceipt,
  receiptIndexCsv,
  receiptLibraryWhere,
  type ReceiptLibraryFilters,
} from "./receipt-query";

export type { ReceiptLibraryFilters };
export { preferredReceipt, receiptIndexCsv, receiptLibraryWhere };

const receiptSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  kind: true,
  role: true,
  storageUrl: true,
  data: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.ExpenseReceiptSelect;

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function searchReceiptLibrary(ctx: AuthContext, filters: ReceiptLibraryFilters) {
  const where = receiptLibraryWhere({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    viewAll: canViewAllExpenses(ctx),
    filters,
  });
  const expenses = await db.expense.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      companyCard: { select: { id: true, name: true, lastFour: true } },
      location: { select: { id: true, name: true } },
      receipts: { where: { deletedAt: null }, select: receiptSelect, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return expenses.map((expense) => ({
    id: expense.id,
    merchant: expense.merchant,
    total: Number(expense.total),
    purchaseDate: dateKey(expense.purchaseDate),
    receiptNumber: expense.receiptNumber,
    project: expense.project,
    employee: expense.employee,
    category: expense.category,
    companyCard: expense.companyCard,
    location: expense.location,
    receipt: (() => {
      const chosen = preferredReceipt(expense.receipts);
      return chosen
        ? { id: chosen.id, fileName: chosen.fileName, mimeType: chosen.mimeType, kind: chosen.kind, role: chosen.role }
        : null;
    })(),
    receiptCount: expense.receipts.length,
  }));
}

export async function buildReceiptArchive(
  ctx: AuthContext,
  input: {
    receiptIds?: string[];
    allFiltered?: boolean;
    includeCsv?: boolean;
    buildDigitalCopies?: boolean;
    filters?: ReceiptLibraryFilters;
  }
) {
  const viewAll = canViewAllExpenses(ctx);
  const filters = input.filters ?? {};
  const where = receiptLibraryWhere({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    viewAll,
    filters,
  });
  const expenses = await db.expense.findMany({
    where: {
      ...where,
      ...(input.receiptIds?.length
        ? { receipts: { some: { id: { in: input.receiptIds }, deletedAt: null } } }
        : {}),
    },
    include: {
      employee: { select: { name: true } },
      category: { select: { name: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, select: { description: true, quantity: true, amount: true } },
      receipts: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { purchaseDate: "asc" },
    take: RECEIPT_ARCHIVE_MAX_FILES,
  });

  const chosen = expenses.flatMap((expense) => {
    if (input.receiptIds?.length) {
      return expense.receipts
        .filter((receipt) => input.receiptIds!.includes(receipt.id))
        .map((receipt) => ({ expense, receipt }));
    }
    const receipt = preferredReceipt(expense.receipts);
    return receipt ? [{ expense, receipt }] : [];
  });
  if (!chosen.length) throw new Error("Invalid receipt download: nothing matched those filters");
  if (chosen.length > RECEIPT_ARCHIVE_MAX_FILES) {
    throw new Error("Invalid receipt download: narrow the selection to 80 receipts or fewer");
  }

  const used = new Set<string>();
  const files: ReceiptArchiveEntry[] = [];
  let bytes = 0;
  for (const item of chosen) {
    const blob = await readReceiptBlob(item.receipt.storageUrl, item.receipt.data, item.receipt.mimeType);
    if (!blob) continue;
    bytes += blob.buffer.length;
    if (bytes > RECEIPT_ARCHIVE_MAX_BYTES) throw new Error(receiptArchiveSizeError());
    const extension = item.receipt.kind === "PDF" || item.receipt.mimeType === "application/pdf"
      ? "pdf"
      : item.receipt.mimeType.includes("png")
        ? "png"
        : "jpg";
    const filename = receiptDownloadName({
      date: dateKey(item.expense.purchaseDate),
      merchant: item.expense.merchant,
      amount: Number(item.expense.total),
      extension,
      used,
    });
    files.push({
      filename,
      buffer: blob.buffer,
      mimeType: blob.mimeType,
      date: dateKey(item.expense.purchaseDate),
      vendor: item.expense.merchant,
      amount: Number(item.expense.total).toFixed(2),
      category: item.expense.category?.name ?? "",
      employee: item.expense.employee.name,
      project: item.expense.project ?? "",
      source: {
        merchant: item.expense.merchant,
        date: dateKey(item.expense.purchaseDate),
        total: Number(item.expense.total),
        tax: Number(item.expense.tax),
        lineItems: item.expense.lineItems.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity),
          amount: Number(line.amount),
        })),
        ocrText: item.receipt.ocrText?.trim() || item.expense.ocrRawText?.trim() || null,
      },
    });
  }
  if (!files.length) throw new Error("Invalid receipt download: the files are no longer stored");
  return assembleReceiptArchive(files, {
    includeCsv: input.includeCsv !== false,
    buildDigitalCopies: input.buildDigitalCopies === true,
  });
}
