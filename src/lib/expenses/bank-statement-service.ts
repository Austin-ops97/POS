import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { bankStatementCreateSchema } from "@/lib/validations/bank-statements";

const MAX_BYTES = 10 * 1024 * 1024;
const STATEMENT_MIME = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function canManageBankStatements(ctx: AuthContext) {
  return [
    PERMISSIONS.VIEW_EXPENSE_REPORTS,
    PERMISSIONS.APPROVE_EXPENSES,
    PERMISSIONS.MANAGE_EXPENSE_SETTINGS,
    PERMISSIONS.EXPORT_EXPENSES,
  ].some((key) => hasPermission(ctx, key));
}

export function canViewBankStatements(ctx: AuthContext) {
  return (
    canManageBankStatements(ctx) ||
    hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES) ||
    hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES)
  );
}

function persistStatementFile(storageUrl: string, mimeType: string) {
  const match = /^data:([^;]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(storageUrl);
  if (!match) throw new Error("Statement upload must contain embedded file data");
  const parsedMime = match[1].toLowerCase();
  if (!STATEMENT_MIME.has(parsedMime) && !STATEMENT_MIME.has(mimeType.toLowerCase())) {
    throw new Error("Upload a PDF, CSV, or image of the statement");
  }
  const data = Buffer.from(match[2], "base64");
  if (!data.length) throw new Error("Statement file is empty");
  if (data.length > MAX_BYTES) throw new Error("Statement exceeds the 10 MB limit");
  const contentHash = createHash("sha256").update(data).digest("hex");
  return {
    mimeType: STATEMENT_MIME.has(parsedMime) ? parsedMime : mimeType.toLowerCase(),
    data,
    sizeBytes: data.length,
    contentHash,
    storageUrl: `database://${contentHash}`,
  };
}

export async function listBankStatements(ctx: AuthContext) {
  if (!canViewBankStatements(ctx)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_OWN_EXPENSES}`);
  }
  return db.bankStatement.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function createBankStatement(ctx: AuthContext, payload: unknown) {
  if (!canManageBankStatements(ctx)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_EXPENSE_REPORTS}`);
  }
  const input = bankStatementCreateSchema.parse(payload);
  const persisted = persistStatementFile(input.storageUrl, input.mimeType);
  return db.bankStatement.create({
    data: {
      businessId: ctx.business.id,
      uploadedById: ctx.employee.id,
      title: input.title,
      accountName: input.accountName || null,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
      notes: input.notes || null,
      fileName: input.fileName,
      mimeType: persisted.mimeType,
      sizeBytes: persisted.sizeBytes,
      storageUrl: persisted.storageUrl,
      data: persisted.data,
      contentHash: persisted.contentHash,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
}

export async function deleteBankStatement(ctx: AuthContext, id: string) {
  if (!canManageBankStatements(ctx)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_EXPENSE_REPORTS}`);
  }
  const existing = await db.bankStatement.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Bank statement not found");
  return db.bankStatement.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
