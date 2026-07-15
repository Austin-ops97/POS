import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ExpenseStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import {
  expenseCreateSchema,
  expenseListQuerySchema,
  expenseUpdateSchema,
} from "@/lib/validations/expenses";
import { ensureDefaultExpenseCategories, findCategoryByName } from "./categories";
import { getExpenseSettings } from "./settings";
import { findPossibleDuplicates } from "./duplicate-detection";
import { detectFraudSignals } from "./fraud-detection";
import { upsertVendorFromMerchant } from "./vendors";
import { logExpenseAudit } from "./audit";
import { notifyEmployee, notifyManagers } from "./notifications";
import { hashContent } from "./hash";
import { checkBudgetAlerts } from "./budget-service";

export const expenseInclude = {
  employee: { select: { id: true, name: true, department: true, email: true } },
  category: { select: { id: true, name: true, slug: true } },
  vendor: { select: { id: true, name: true, isFavorite: true } },
  companyCard: {
    select: {
      id: true,
      name: true,
      lastFour: true,
      bank: true,
      status: true,
      monthlyLimit: true,
    },
  },
  location: { select: { id: true, name: true } },
  receipts: { where: { deletedAt: null }, orderBy: { pageNumber: "asc" as const } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  tags: { include: { tag: true } },
  comments: {
    where: { deletedAt: null },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  approvalEvents: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  flags: { where: { resolved: false }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ExpenseInclude;

function computeTotal(amount: number, tax: number, tip: number, explicit?: number) {
  if (explicit != null && Number.isFinite(explicit)) return Number(explicit.toFixed(2));
  return Number((amount + tax + tip).toFixed(2));
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function canViewAllExpenses(ctx: AuthContext): boolean {
  return (
    hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES) ||
    hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES) ||
    hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS) ||
    hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES) ||
    ctx.employee.role.name === "Owner" ||
    ctx.employee.role.name === "Finance"
  );
}

export async function ensureExpenseModuleReady(businessId: string) {
  await Promise.all([
    ensureDefaultExpenseCategories(businessId),
    getExpenseSettings(businessId),
  ]);
}

export async function listExpenses(
  ctx: AuthContext,
  rawQuery: Record<string, string | undefined>
) {
  await ensureExpenseModuleReady(ctx.business.id);
  const query = expenseListQuerySchema.parse(rawQuery);
  const viewAll = canViewAllExpenses(ctx);

  const where: Prisma.ExpenseWhereInput = {
    businessId: ctx.business.id,
    deletedAt: null,
    ...(viewAll ? {} : { employeeId: ctx.employee.id }),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.companyCardId ? { companyCardId: query.companyCardId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    ...(query.department
      ? { department: { equals: query.department, mode: "insensitive" } }
      : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.project
      ? { project: { equals: query.project, mode: "insensitive" } }
      : {}),
    ...(query.jobNumber
      ? { jobNumber: { equals: query.jobNumber, mode: "insensitive" } }
      : {}),
    ...(query.merchant
      ? { merchant: { contains: query.merchant, mode: "insensitive" } }
      : {}),
    ...(query.missingReceipt != null ? { missingReceipt: query.missingReceipt } : {}),
    ...(query.receiptExists === true
      ? { receipts: { some: { deletedAt: null } } }
      : {}),
    ...(query.receiptExists === false
      ? { receipts: { none: { deletedAt: null } } }
      : {}),
    ...(query.flagged === true ? { flags: { some: { resolved: false } } } : {}),
    ...(query.minAmount != null || query.maxAmount != null
      ? {
          total: {
            ...(query.minAmount != null ? { gte: query.minAmount } : {}),
            ...(query.maxAmount != null ? { lte: query.maxAmount } : {}),
          },
        }
      : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          purchaseDate: {
            ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.tag
      ? {
          tags: {
            some: { tag: { name: { equals: query.tag, mode: "insensitive" } } },
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { merchant: { contains: query.q, mode: "insensitive" } },
            { notes: { contains: query.q, mode: "insensitive" } },
            { department: { contains: query.q, mode: "insensitive" } },
            { project: { contains: query.q, mode: "insensitive" } },
            { jobNumber: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    db.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: query.pageSize,
    }),
    db.expense.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function syncTags(expenseId: string, businessId: string, tags: string[]) {
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  const tagRows = await Promise.all(
    unique.map((name) =>
      db.expenseTag.upsert({
        where: { businessId_name: { businessId, name } },
        create: { businessId, name },
        update: {},
      })
    )
  );
  await db.expenseTagAssignment.deleteMany({ where: { expenseId } });
  if (tagRows.length === 0) return;
  await db.expenseTagAssignment.createMany({
    data: tagRows.map((tag) => ({ expenseId, tagId: tag.id })),
    skipDuplicates: true,
  });
}

async function applyPolicyFlags(params: {
  expenseId: string;
  businessId: string;
  actorId?: string;
  total: number;
  purchaseDate: Date;
  categoryName?: string | null;
  allowedCategoryNames?: string[];
  missingReceipt: boolean;
  merchant: string;
}) {
  const settings = await getExpenseSettings(params.businessId);
  const start = new Date(params.purchaseDate);
  start.setUTCDate(start.getUTCDate() - 7);

  const recentIdentical = await db.expense.count({
    where: {
      businessId: params.businessId,
      deletedAt: null,
      id: { not: params.expenseId },
      merchant: { equals: params.merchant, mode: "insensitive" },
      total: params.total,
      purchaseDate: { gte: start },
    },
  });

  const half = Number((params.total / 2).toFixed(2));
  const splitNearby = await db.expense.count({
    where: {
      businessId: params.businessId,
      deletedAt: null,
      id: { not: params.expenseId },
      merchant: { equals: params.merchant, mode: "insensitive" },
      total: { gte: half - 0.5, lte: half + 0.5 },
      purchaseDate: {
        gte: new Date(params.purchaseDate.getTime() - 2 * 86400000),
        lte: new Date(params.purchaseDate.getTime() + 2 * 86400000),
      },
    },
  });

  const signals = detectFraudSignals({
    total: params.total,
    purchaseDate: params.purchaseDate,
    categoryName: params.categoryName,
    allowedCategoryNames: params.allowedCategoryNames,
    largePurchaseThreshold: Number(settings.largePurchaseThreshold),
    afterHoursStart: settings.afterHoursStart,
    afterHoursEnd: settings.afterHoursEnd,
    weekendFlagsEnabled: settings.weekendFlagsEnabled,
    missingReceipt: params.missingReceipt,
    requireReceiptAbove: Number(settings.requireReceiptAbove),
    recentIdenticalCount: recentIdentical,
    looksLikeSplit: splitNearby > 0,
  });

  await db.expenseFlag.deleteMany({
    where: {
      expenseId: params.expenseId,
      resolved: false,
      type: { not: "MANUAL" },
    },
  });

  if (signals.length === 0) return signals;

  await db.expenseFlag.createMany({
    data: signals.map((s) => ({
      expenseId: params.expenseId,
      type: s.type,
      severity: s.severity,
      message: s.message,
      raisedById: params.actorId,
    })),
  });

  return signals;
}

export async function createExpense(
  ctx: AuthContext,
  raw: z.infer<typeof expenseCreateSchema>,
  ipAddress?: string
) {
  if (!hasPermission(ctx, PERMISSIONS.CREATE_EXPENSE)) {
    throw new Error(`Missing permission: ${PERMISSIONS.CREATE_EXPENSE}`);
  }

  await ensureExpenseModuleReady(ctx.business.id);
  const data = expenseCreateSchema.parse(raw);
  const settings = await getExpenseSettings(ctx.business.id);

  const employeeId =
    data.employeeId && canViewAllExpenses(ctx) ? data.employeeId : ctx.employee.id;

  const tax = data.tax ?? 0;
  const tip = data.tip ?? 0;
  const total = computeTotal(data.amount, tax, tip, data.total);
  const purchaseDate = parseDateOnly(data.purchaseDate);
  const submit = Boolean(data.submit) || settings.autoSubmitOnCreate;
  const status: ExpenseStatus = submit ? "PENDING_APPROVAL" : (data.status ?? "DRAFT");

  let allowedCategoryNames: string[] | undefined;
  if (data.companyCardId) {
    const card = await db.companyCard.findFirst({
      where: {
        id: data.companyCardId,
        businessId: ctx.business.id,
        deletedAt: null,
      },
      include: { allowedCategories: { include: { category: true } } },
    });
    if (!card) throw new Error("Company card not found");
    allowedCategoryNames = card.allowedCategories.map((c) => c.category.name);
  }

  const vendor = await upsertVendorFromMerchant({
    businessId: ctx.business.id,
    merchant: data.merchant,
    categoryId: data.categoryId,
    spend: total,
  });

  const contentHash = hashContent(
    `${data.merchant}|${total}|${data.purchaseDate}|${employeeId}`
  );

  const duplicates = await findPossibleDuplicates(ctx.business.id, {
    merchant: data.merchant,
    total,
    purchaseDate,
    contentHash,
  });

  const expense = await db.expense.create({
    data: {
      businessId: ctx.business.id,
      employeeId,
      submittedById: submit ? ctx.employee.id : null,
      categoryId: data.categoryId ?? null,
      vendorId: vendor?.id ?? null,
      companyCardId: data.companyCardId ?? null,
      locationId: data.locationId ?? ctx.location?.id ?? null,
      department: data.department ?? ctx.employee.department ?? null,
      project: data.project ?? null,
      jobNumber: data.jobNumber ?? null,
      merchant: data.merchant.trim(),
      amount: data.amount,
      tax,
      tip,
      total,
      currency: data.currency ?? settings.defaultCurrency,
      purchaseDate,
      paymentMethod: data.paymentMethod ?? "COMPANY_CARD",
      mileageMiles: data.mileageMiles ?? null,
      mileageRate: data.mileageRate ?? null,
      notes: data.notes ?? null,
      status,
      missingReceipt: data.missingReceipt ?? true,
      receiptReminderAt: data.missingReceipt !== false ? new Date() : null,
      submittedAt: submit ? new Date() : null,
      contentHash,
      lineItems: data.lineItems?.length
        ? {
            create: data.lineItems.map((item, index) => ({
              description: item.description,
              quantity: item.quantity ?? 1,
              unitPrice: item.unitPrice ?? null,
              amount: item.amount,
              sortOrder: index,
            })),
          }
        : undefined,
      approvalEvents: submit
        ? {
            create: {
              actorId: ctx.employee.id,
              fromStatus: "DRAFT",
              toStatus: "PENDING_APPROVAL",
              action: "SUBMIT",
            },
          }
        : undefined,
    },
    include: expenseInclude,
  });

  if (data.tags?.length) {
    await syncTags(expense.id, ctx.business.id, data.tags);
  }

  const categoryName = expense.category?.name;
  const signals = await applyPolicyFlags({
    expenseId: expense.id,
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    total,
    purchaseDate,
    categoryName,
    allowedCategoryNames,
    missingReceipt: expense.missingReceipt,
    merchant: expense.merchant,
  });

  if (duplicates.length) {
    await db.expenseFlag.createMany({
      data: duplicates.map((d) => ({
        expenseId: expense.id,
        type: "DUPLICATE",
        severity: "WARNING",
        message: `${d.message} (${d.reasons.join("; ")})`,
        raisedById: ctx.employee.id,
      })),
    });
  }

  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    expenseId: expense.id,
    action: submit ? "SUBMIT" : "CREATE",
    entity: "Expense",
    entityId: expense.id,
    after: expense,
    ipAddress,
    systemAction: submit ? "EXPENSE_SUBMIT" : "EXPENSE_CREATE",
  });

  if (submit) {
    await notifyManagers({
      businessId: ctx.business.id,
      type: "PENDING_APPROVAL",
      title: "Expense waiting approval",
      body: `${ctx.employee.name} submitted ${expense.merchant} for $${total.toFixed(2)}.`,
      expenseId: expense.id,
      excludeEmployeeId: ctx.employee.id,
    });
  }

  if (signals.some((s) => s.type === "LARGE_PURCHASE" || s.severity === "HIGH")) {
    await notifyManagers({
      businessId: ctx.business.id,
      type: "LARGE_PURCHASE",
      title: "Large or suspicious purchase",
      body: `${expense.merchant} — $${total.toFixed(2)} needs review.`,
      expenseId: expense.id,
    });
  }

  if (expense.missingReceipt) {
    await notifyEmployee({
      businessId: ctx.business.id,
      employeeId: expense.employeeId,
      type: "RECEIPT_MISSING",
      title: "Receipt missing",
      body: `Please upload a receipt for ${expense.merchant}.`,
      expenseId: expense.id,
    });
  }

  await checkBudgetAlerts(ctx.business.id, expense.categoryId);

  const refreshed = await db.expense.findUniqueOrThrow({
    where: { id: expense.id },
    include: expenseInclude,
  });

  return { expense: refreshed, duplicates, warnings: signals };
}

export async function updateExpense(
  ctx: AuthContext,
  expenseId: string,
  raw: z.infer<typeof expenseUpdateSchema>,
  ipAddress?: string
) {
  const existing = await db.expense.findFirst({
    where: { id: expenseId, businessId: ctx.business.id, deletedAt: null },
    include: expenseInclude,
  });
  if (!existing) throw new Error("Expense not found");

  const isOwner = existing.employeeId === ctx.employee.id;
  const canManage = canViewAllExpenses(ctx);
  if (!isOwner && !canManage) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_TEAM_EXPENSES}`);
  }
  if (
    !canManage &&
    !["DRAFT", "NEEDS_MORE_INFO", "REJECTED"].includes(existing.status)
  ) {
    throw new Error("Only draft or returned expenses can be edited");
  }

  const data = expenseUpdateSchema.parse(raw);
  const tax = data.tax ?? Number(existing.tax);
  const tip = data.tip ?? Number(existing.tip);
  const amount = data.amount ?? Number(existing.amount);
  const total = computeTotal(amount, tax, tip, data.total);
  const purchaseDate = data.purchaseDate
    ? parseDateOnly(data.purchaseDate)
    : existing.purchaseDate;

  let vendorId = existing.vendorId;
  if (data.merchant && data.merchant !== existing.merchant) {
    const vendor = await upsertVendorFromMerchant({
      businessId: ctx.business.id,
      merchant: data.merchant,
      categoryId: data.categoryId ?? existing.categoryId,
      spend: total,
    });
    vendorId = vendor?.id ?? vendorId;
  }

  const updated = await db.expense.update({
    where: { id: expenseId },
    data: {
      merchant: data.merchant?.trim(),
      amount: data.amount,
      tax: data.tax,
      tip: data.tip,
      total,
      purchaseDate: data.purchaseDate ? purchaseDate : undefined,
      companyCardId: data.companyCardId === undefined ? undefined : data.companyCardId,
      categoryId: data.categoryId === undefined ? undefined : data.categoryId,
      locationId: data.locationId === undefined ? undefined : data.locationId,
      department: data.department === undefined ? undefined : data.department,
      project: data.project === undefined ? undefined : data.project,
      jobNumber: data.jobNumber === undefined ? undefined : data.jobNumber,
      notes: data.notes === undefined ? undefined : data.notes,
      paymentMethod: data.paymentMethod,
      mileageMiles: data.mileageMiles === undefined ? undefined : data.mileageMiles,
      mileageRate: data.mileageRate === undefined ? undefined : data.mileageRate,
      currency: data.currency,
      missingReceipt: data.missingReceipt,
      vendorId,
      ...(data.submit
        ? {
            status: "PENDING_APPROVAL" as ExpenseStatus,
            submittedAt: new Date(),
            submittedById: ctx.employee.id,
          }
        : {}),
    },
    include: expenseInclude,
  });

  if (data.tags) await syncTags(expenseId, ctx.business.id, data.tags);

  if (data.lineItems) {
    await db.expenseLineItem.deleteMany({ where: { expenseId } });
    if (data.lineItems.length) {
      await db.expenseLineItem.createMany({
        data: data.lineItems.map((item, index) => ({
          expenseId,
          description: item.description,
          quantity: item.quantity ?? 1,
          unitPrice: item.unitPrice ?? null,
          amount: item.amount,
          sortOrder: index,
        })),
      });
    }
  }

  if (data.submit) {
    await db.expenseApprovalEvent.create({
      data: {
        expenseId,
        actorId: ctx.employee.id,
        fromStatus: existing.status,
        toStatus: "PENDING_APPROVAL",
        action: "SUBMIT",
      },
    });
    await notifyManagers({
      businessId: ctx.business.id,
      type: "PENDING_APPROVAL",
      title: "Expense waiting approval",
      body: `${ctx.employee.name} submitted ${updated.merchant} for $${Number(updated.total).toFixed(2)}.`,
      expenseId,
      excludeEmployeeId: ctx.employee.id,
    });
  }

  await applyPolicyFlags({
    expenseId,
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    total: Number(updated.total),
    purchaseDate: updated.purchaseDate,
    categoryName: updated.category?.name,
    missingReceipt: updated.missingReceipt,
    merchant: updated.merchant,
  });

  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    expenseId,
    action: data.submit ? "SUBMIT" : "UPDATE",
    entity: "Expense",
    entityId: expenseId,
    before: existing,
    after: updated,
    ipAddress,
    systemAction: data.submit ? "EXPENSE_SUBMIT" : "EXPENSE_UPDATE",
  });

  return db.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: expenseInclude,
  });
}

export async function getExpenseById(ctx: AuthContext, id: string) {
  const expense = await db.expense.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
    include: expenseInclude,
  });
  if (!expense) return null;
  if (expense.employeeId !== ctx.employee.id && !canViewAllExpenses(ctx)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_TEAM_EXPENSES}`);
  }
  return expense;
}

export async function softDeleteExpense(ctx: AuthContext, id: string, ipAddress?: string) {
  const expense = await getExpenseById(ctx, id);
  if (!expense) throw new Error("Expense not found");
  if (
    expense.employeeId !== ctx.employee.id &&
    !hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_SETTINGS)
  ) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_SETTINGS}`);
  }

  const updated = await db.expense.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED", archivedAt: new Date() },
  });

  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    expenseId: id,
    action: "ARCHIVE",
    entity: "Expense",
    entityId: id,
    before: expense,
    after: updated,
    ipAddress,
    systemAction: "EXPENSE_UPDATE",
  });

  return updated;
}

export async function resolveCategorySuggestion(businessId: string, name?: string) {
  if (!name) return null;
  await ensureDefaultExpenseCategories(businessId);
  return findCategoryByName(businessId, name);
}
