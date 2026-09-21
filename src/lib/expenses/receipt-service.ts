import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { expenseReceiptSchema } from "@/lib/validations/expenses";
import { getExpenseById, expenseInclude, canViewAllExpenses } from "./expense-service";
import { PERMISSIONS } from "@/lib/permissions";
import { hashReceiptPayload } from "./hash";
import { findPossibleDuplicates } from "./duplicate-detection";
import { logExpenseAudit } from "./audit";
import { notifyEmployee, notifyManagers } from "./notifications";
import { parseReceiptText } from "./ocr";
import { persistReceiptBlob } from "@/lib/storage/receipt-storage";
import { z } from "zod";

export async function attachReceipt(
  ctx: AuthContext,
  expenseId: string,
  raw: z.infer<typeof expenseReceiptSchema>,
  ipAddress?: string
) {
  const expense = await getExpenseById(ctx, expenseId);
  if (!expense) throw new Error("Expense not found");

  const data = expenseReceiptSchema.parse(raw);
  const kind =
    data.kind ??
    (data.mimeType === "application/pdf" || data.fileName.toLowerCase().endsWith(".pdf")
      ? "PDF"
      : "IMAGE");

  const persisted = await persistReceiptBlob({
    businessId: ctx.business.id,
    expenseId,
    fileName: data.fileName,
    mimeType: data.mimeType,
    storageUrl: data.storageUrl,
  });

  const contentHash = hashReceiptPayload({
    storageUrl: persisted.storageUrl,
    contentHash: persisted.contentHash || data.contentHash,
    fileName: data.fileName,
    sizeBytes: persisted.sizeBytes,
  });

  const duplicates = await findPossibleDuplicates(ctx.business.id, {
    merchant: expense.merchant,
    total: Number(expense.total),
    purchaseDate: expense.purchaseDate,
    receiptHashes: [contentHash],
    excludeExpenseId: expenseId,
  });

  const receipt = await db.expenseReceipt.create({
    data: {
      expenseId,
      kind,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: persisted.sizeBytes,
      storageUrl: persisted.storageUrl,
      data: persisted.data,
      pageNumber: data.pageNumber ?? 1,
      width: data.width,
      height: data.height,
      contentHash,
      ocrText: data.ocrText,
      enhanced: data.enhanced ?? false,
      role: data.role ?? (data.enhanced ? "PROCESSED" : "ORIGINAL"),
    },
  });

  const updated = await db.expense.update({
    where: { id: expenseId },
    data: {
      missingReceipt: false,
      receiptReminderAt: null,
      ...(data.ocrText ? { ocrRawText: data.ocrText } : {}),
    },
    include: expenseInclude,
  });

  if (duplicates.length) {
    await db.expenseFlag.createMany({
      data: duplicates.map((d) => ({
        expenseId,
        type: "DUPLICATE",
        severity: "WARNING",
        message: `${d.message} (${d.reasons.join("; ")})`,
        raisedById: ctx.employee.id,
      })),
    });
  }

  await db.expenseFlag.updateMany({
    where: { expenseId, type: "MISSING_RECEIPT", resolved: false },
    data: { resolved: true, resolvedAt: new Date() },
  });

  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    expenseId,
    action: "RECEIPT_UPLOAD",
    entity: "ExpenseReceipt",
    entityId: receipt.id,
    after: { fileName: receipt.fileName, kind: receipt.kind },
    ipAddress,
    systemAction: "EXPENSE_UPDATE",
  });

  await notifyManagers({
    businessId: ctx.business.id,
    type: "RECEIPT_MISSING",
    title: "Receipt uploaded",
    body: `${ctx.employee.name} uploaded a receipt for ${expense.merchant}.`,
    expenseId,
    excludeEmployeeId: ctx.employee.id,
  });

  // Keep employee reminder quiet once uploaded
  await notifyEmployee({
    businessId: ctx.business.id,
    employeeId: expense.employeeId,
    type: "RECEIPT_MISSING",
    title: "Receipt attached",
    body: `Receipt saved for ${expense.merchant}.`,
    expenseId,
  });

  return { receipt, expense: updated, duplicates };
}

export async function softDeleteReceipt(ctx: AuthContext, receiptId: string, ipAddress?: string) {
  const receipt = await db.expenseReceipt.findFirst({
    where: {
      id: receiptId,
      deletedAt: null,
      expense: { businessId: ctx.business.id, deletedAt: null },
    },
    include: { expense: { select: { id: true, employeeId: true } } },
  });
  if (!receipt) throw new Error("Receipt not found");
  if (receipt.expense.employeeId !== ctx.employee.id && !canViewAllExpenses(ctx)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_TEAM_EXPENSES}`);
  }
  const deletedAt = new Date();
  await db.expenseReceipt.update({ where: { id: receipt.id }, data: { deletedAt } });
  const remaining = await db.expenseReceipt.count({
    where: { expenseId: receipt.expense.id, deletedAt: null },
  });
  if (remaining === 0) {
    await db.expense.update({
      where: { id: receipt.expense.id },
      data: { missingReceipt: true },
    });
  }
  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    expenseId: receipt.expense.id,
    action: "RECEIPT_DELETE",
    entity: "ExpenseReceipt",
    entityId: receipt.id,
    before: { fileName: receipt.fileName, kind: receipt.kind },
    after: { deletedAt: deletedAt.toISOString() },
    ipAddress,
    systemAction: "EXPENSE_UPDATE",
  });
  return { id: receipt.id };
}

export function parseOcrPayload(input: {
  text?: string;
  fileName?: string;
}) {
  if (!input.text?.trim()) {
    return parseReceiptText("", input.fileName);
  }
  return parseReceiptText(input.text, input.fileName);
}
