import type { Prisma } from "@prisma/client";
import JSZip from "jszip";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { canViewAllExpenses } from "./expense-service";
import { readReceiptBlob } from "@/lib/storage/receipt-storage";
import { receiptDownloadName } from "./reconciliation";
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
  input: { receiptIds?: string[]; allFiltered?: boolean; includeCsv?: boolean; filters?: ReceiptLibraryFilters }
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
      receipts: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { purchaseDate: "asc" },
    take: 80,
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
  if (chosen.length > 80) throw new Error("Invalid receipt download: narrow the selection to 80 receipts or fewer");

  const zip = new JSZip();
  const used = new Set<string>();
  const index: Array<{
    filename: string;
    date: string;
    vendor: string;
    amount: string;
    category: string;
    employee: string;
    project: string;
  }> = [];
  let bytes = 0;
  for (const item of chosen) {
    const blob = await readReceiptBlob(item.receipt.storageUrl, item.receipt.data, item.receipt.mimeType);
    if (!blob) continue;
    bytes += blob.buffer.length;
    if (bytes > 30_000_000) throw new Error("Invalid receipt download: the archive is larger than 30 MB. Narrow the date range.");
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
    zip.file(filename, blob.buffer);
    index.push({
      filename,
      date: dateKey(item.expense.purchaseDate),
      vendor: item.expense.merchant,
      amount: Number(item.expense.total).toFixed(2),
      category: item.expense.category?.name ?? "",
      employee: item.expense.employee.name,
      project: item.expense.project ?? "",
    });
  }
  if (!index.length) throw new Error("Invalid receipt download: the files are no longer stored");
  if (input.includeCsv !== false) zip.file("receipt-index.csv", receiptIndexCsv(index));
  const archive = await zip.generateAsync({ type: "nodebuffer" });
  return { archive, count: index.length };
}
