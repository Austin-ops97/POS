import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import type { AuthContext } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { normalizeVendorName } from "@/lib/expenses/constants";
import { IMPORT_BYTE_LIMIT, parseTextTable } from "@/lib/import/import-plan";
import { parseXlsx } from "@/lib/import/parse-xlsx";
import { BANK_PAGE_SIZE, bankListWindow, canEditBankTransactions, canExportTaxSummary, canImportStatements, canViewBankTransactions, canViewProfitAndLoss } from "./access";
import { assertSplitsBalance, suggestCategory } from "./categorize";
import { bankTransactionWhere, dayEnd, dayStart } from "./filters";
import { buildProfitAndLoss } from "./pnl";
import { isReportPreset, reportRange, type ReportPreset } from "./pnl";
import { parseStatementTable } from "./statement";
import { buildTaxSummary, TAX_SUMMARY_DISCLAIMER } from "./tax-summary";
import { receiptZip, taxSummaryCsv, taxSummaryPdf, taxSummaryXlsx } from "./tax-export";

const REPORT_TAKE = 2000;
const APPROVED = ["APPROVED", "REIMBURSED", "PAID"] as const;

function cents(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return Math.round(Number(value.toString()) * 100);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function assertView(ctx: AuthContext) {
  if (!canViewBankTransactions(ctx)) throw new Error("Missing permission: view_expense_reports");
}

function assertEdit(ctx: AuthContext) {
  if (!canEditBankTransactions(ctx)) throw new Error("Missing permission: approve_expenses");
}

function assertReports(ctx: AuthContext) {
  if (!canViewProfitAndLoss(ctx)) throw new Error("Missing permission: view_expense_reports");
}

export type BankListQuery = {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  q?: string;
  personal?: "all" | "personal" | "business";
  page?: number;
};

async function categorizationContext(businessId: string) {
  const [rules, categories] = await Promise.all([
    db.expenseCategoryRule.findMany({ where: { businessId }, include: { category: { select: { name: true } } } }),
    db.expenseCategory.findMany({ where: { businessId, deletedAt: null, isActive: true }, select: { id: true, name: true } }),
  ]);
  return {
    rules: rules.map((rule) => ({ pattern: rule.pattern, categoryId: rule.categoryId, categoryName: rule.category.name })),
    categoriesByName: Object.fromEntries(categories.map((category) => [category.name, category.id])),
  };
}

async function assertBusinessRefs(
  businessId: string,
  refs: { categoryId?: string | null; projectId?: string | null; vendorId?: string | null; customerId?: string | null; employeeId?: string | null },
) {
  if (refs.categoryId) {
    const row = await db.expenseCategory.findFirst({ where: { id: refs.categoryId, businessId, deletedAt: null } });
    if (!row) throw new Error("Invalid category: it is not on this business");
  }
  if (refs.projectId) {
    const row = await db.officeWorkspaceRecord.findFirst({ where: { id: refs.projectId, businessId, workspace: "projects" } });
    if (!row) throw new Error("Invalid project: it is not on this business");
  }
  if (refs.vendorId) {
    const row = await db.expenseVendor.findFirst({ where: { id: refs.vendorId, businessId, deletedAt: null } });
    if (!row) throw new Error("Invalid vendor: it is not on this business");
  }
  if (refs.customerId) {
    const row = await db.customer.findFirst({ where: { id: refs.customerId, businessId } });
    if (!row) throw new Error("Invalid customer: it is not on this business");
  }
  if (refs.employeeId) {
    const row = await db.employeeProfile.findFirst({ where: { id: refs.employeeId, businessId } });
    if (!row) throw new Error("Invalid employee: it is not on this business");
  }
}

export async function listBankCenter(ctx: AuthContext, query: BankListQuery) {
  assertView(ctx);
  const businessId = ctx.business.id;
  const where = {
    ...bankTransactionWhere(businessId, {
      accountId: query.accountId,
      categoryId: query.categoryId,
      personal: query.personal === "personal" ? true : query.personal === "business" ? false : null,
    }),
    ...(query.from || query.to
      ? {
          postedOn: {
            ...(query.from ? { gte: dayStart(query.from) } : {}),
            ...(query.to ? { lte: dayStart(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { rawDescription: { contains: query.q, mode: "insensitive" as const } },
            { rawMerchant: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const window = bankListWindow(query.page);
  const [transactions, accounts, categories, vendors, projects, customers, employees, expenses, receipts] = await Promise.all([
    db.bankTransaction.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, mask: true, kind: true } },
        category: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, title: true } },
        splits: { orderBy: { sortOrder: "asc" }, include: { category: { select: { name: true } } } },
        associations: { select: { id: true, receiptId: true, documentId: true, expenseId: true, projectId: true, vendorId: true, employeeId: true, customerId: true } },
      },
      orderBy: [{ postedOn: "desc" }, { createdAt: "desc" }],
      skip: window.skip,
      take: window.take,
    }),
    db.bankAccount.findMany({ where: { businessId }, select: { id: true, name: true, mask: true, kind: true }, orderBy: { name: "asc" } }),
    db.expenseCategory.findMany({ where: { businessId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.expenseVendor.findMany({ where: { businessId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    db.officeWorkspaceRecord.findMany({ where: { businessId, workspace: "projects", archivedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" }, take: 200 }),
    db.customer.findMany({ where: { businessId }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: "asc" }, take: 200 }),
    db.employeeProfile.findMany({ where: { businessId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    db.expense.findMany({
      where: { businessId, deletedAt: null },
      select: { id: true, merchant: true, total: true, purchaseDate: true },
      orderBy: { purchaseDate: "desc" },
      take: 40,
    }),
    db.expenseReceipt.findMany({
      where: { deletedAt: null, expense: { businessId, deletedAt: null } },
      select: { id: true, fileName: true, expense: { select: { merchant: true } } },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);
  const pageRows = transactions.slice(0, BANK_PAGE_SIZE);
  return {
    page: window.page,
    hasMore: transactions.length > BANK_PAGE_SIZE,
    transactions: pageRows.map((txn) => ({
      id: txn.id,
      postedOn: isoDate(txn.postedOn),
      rawDescription: txn.rawDescription,
      rawMerchant: txn.rawMerchant,
      amount: Number(txn.amount),
      type: Number(txn.amount) < 0 ? "Withdrawal" : "Deposit",
      accountId: txn.accountId,
      accountName: txn.account.name,
      accountMask: txn.account.mask,
      accountKind: txn.account.kind,
      source: txn.source,
      categoryId: txn.categoryId,
      categoryName: txn.category?.name ?? null,
      suggestedCategoryId: txn.suggestedCategoryId,
      suggestionReason: txn.suggestionReason,
      projectId: txn.projectId,
      projectTitle: txn.project?.title ?? null,
      vendorId: txn.vendorId,
      vendorName: txn.vendor?.name ?? null,
      customerId: txn.customerId,
      customerName: txn.customer ? [txn.customer.firstName, txn.customer.lastName].filter(Boolean).join(" ") : null,
      notes: txn.notes,
      personal: txn.personal,
      reconciliation: txn.reconciliation,
      matchedExpenseId: txn.matchedExpenseId,
      rawBalance: txn.rawBalance == null ? null : Number(txn.rawBalance),
      splits: txn.splits.map((split) => ({
        id: split.id,
        categoryId: split.categoryId,
        categoryName: split.category?.name ?? null,
        projectId: split.projectId,
        vendorId: split.vendorId,
        amount: Number(split.amount),
        notes: split.notes,
      })),
      associations: txn.associations,
    })),
    accounts,
    categories,
    vendors,
    projects,
    customers: customers.map((customer) => ({ id: customer.id, name: [customer.firstName, customer.lastName].filter(Boolean).join(" ") })),
    employees,
    receipts: receipts.map((receipt) => ({ id: receipt.id, fileName: receipt.fileName, merchant: receipt.expense.merchant })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      name: `${isoDate(expense.purchaseDate)} · ${expense.merchant} · ${Number(expense.total).toFixed(2)}`,
    })),
  };
}

export async function updateBankTransaction(
  ctx: AuthContext,
  id: string,
  input: {
    categoryId?: string | null;
    projectId?: string | null;
    vendorId?: string | null;
    customerId?: string | null;
    notes?: string | null;
    personal?: boolean;
    remember?: boolean;
    matchedExpenseId?: string | null;
  },
) {
  assertEdit(ctx);
  const txn = await db.bankTransaction.findFirst({ where: { id, businessId: ctx.business.id } });
  if (!txn) throw new Error("Bank transaction not found");
  const categoryId = input.categoryId === undefined ? txn.categoryId : input.categoryId || null;
  const projectId = input.projectId === undefined ? txn.projectId : input.projectId || null;
  const vendorId = input.vendorId === undefined ? txn.vendorId : input.vendorId || null;
  const customerId = input.customerId === undefined ? txn.customerId : input.customerId || null;
  const matchedExpenseId = input.matchedExpenseId === undefined ? txn.matchedExpenseId : input.matchedExpenseId || null;
  if (matchedExpenseId) {
    const expense = await db.expense.findFirst({ where: { id: matchedExpenseId, businessId: ctx.business.id, deletedAt: null } });
    if (!expense) throw new Error("Expense not found");
  }
  await assertBusinessRefs(ctx.business.id, { categoryId, projectId, vendorId, customerId });
  const personal = input.personal ?? txn.personal;
  const reconciliation = personal ? "EXCLUDED" : matchedExpenseId ? "MATCHED" : categoryId ? "CATEGORIZED" : "UNREVIEWED";
  await db.bankTransaction.update({
    where: { id: txn.id },
    data: {
      categoryId,
      projectId,
      vendorId,
      customerId,
      matchedExpenseId,
      notes: input.notes === undefined ? txn.notes : input.notes,
      personal,
      reconciliation,
    },
  });
  if (input.remember && categoryId) {
    const pattern = normalizeVendorName(txn.rawMerchant || txn.rawDescription);
    if (!pattern) throw new Error("Invalid rule: the transaction has no merchant or description to remember");
    await db.expenseCategoryRule.upsert({
      where: { businessId_pattern: { businessId: ctx.business.id, pattern } },
      create: { businessId: ctx.business.id, categoryId, pattern, createdById: ctx.employee.id },
      update: { categoryId },
    });
  }
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "BankTransaction",
    entityId: txn.id,
    details: { kind: "BANK_CATEGORY_CHANGED", categoryId, previousCategoryId: txn.categoryId, remembered: Boolean(input.remember && categoryId) },
  });
  return { id: txn.id, categoryId, personal, reconciliation };
}

export async function replaceBankSplits(
  ctx: AuthContext,
  id: string,
  splits: { categoryId?: string | null; projectId?: string | null; vendorId?: string | null; amount: number; notes?: string | null }[],
) {
  assertEdit(ctx);
  const txn = await db.bankTransaction.findFirst({ where: { id, businessId: ctx.business.id } });
  if (!txn) throw new Error("Bank transaction not found");
  if (splits.length === 0) {
    await db.bankTransactionSplit.deleteMany({ where: { businessId: ctx.business.id, transactionId: txn.id } });
    return { id: txn.id, splits: 0 };
  }
  assertSplitsBalance(cents(txn.amount), splits.map((split) => Math.round(Number(split.amount) * 100)));
  for (const split of splits) {
    await assertBusinessRefs(ctx.business.id, {
      categoryId: split.categoryId || null,
      projectId: split.projectId || null,
      vendorId: split.vendorId || null,
    });
  }
  await db.$transaction(async (tx) => {
    await tx.bankTransactionSplit.deleteMany({ where: { businessId: ctx.business.id, transactionId: txn.id } });
    for (const [index, split] of splits.entries()) {
      await tx.bankTransactionSplit.create({
        data: {
          businessId: ctx.business.id,
          transactionId: txn.id,
          categoryId: split.categoryId || null,
          projectId: split.projectId || null,
          vendorId: split.vendorId || null,
          amount: Math.round(Number(split.amount) * 100) / 100,
          notes: split.notes || null,
          sortOrder: index,
        },
      });
    }
    if (splits.length > 0 && splits.every((split) => split.categoryId) && !txn.personal) {
      await tx.bankTransaction.update({ where: { id: txn.id }, data: { reconciliation: txn.matchedExpenseId ? "MATCHED" : "CATEGORIZED" } });
    }
  });
  return { id: txn.id, splits: splits.length };
}

export async function createRecordAssociation(
  ctx: AuthContext,
  input: {
    receiptId?: string | null;
    documentId?: string | null;
    expenseId?: string | null;
    bankTransactionId?: string | null;
    projectId?: string | null;
    vendorId?: string | null;
    employeeId?: string | null;
    customerId?: string | null;
  },
) {
  assertEdit(ctx);
  const receiptId = input.receiptId || null;
  const documentId = input.documentId || null;
  const expenseId = input.expenseId || null;
  const bankTransactionId = input.bankTransactionId || null;
  const projectId = input.projectId || null;
  const vendorId = input.vendorId || null;
  const employeeId = input.employeeId || null;
  const customerId = input.customerId || null;
  if (!receiptId && !documentId) throw new Error("Invalid association: choose a receipt or document");
  if (!expenseId && !bankTransactionId && !projectId && !vendorId && !employeeId && !customerId) {
    throw new Error("Invalid association: choose a record to link");
  }
  const businessId = ctx.business.id;
  if (receiptId) {
    const receipt = await db.expenseReceipt.findFirst({ where: { id: receiptId, deletedAt: null, expense: { businessId, deletedAt: null } } });
    if (!receipt) throw new Error("Receipt not found");
  }
  if (documentId) {
    const document = await db.officeDocument.findFirst({ where: { id: documentId, businessId, deletedAt: null } });
    if (!document) throw new Error("Document not found");
  }
  if (expenseId) {
    const expense = await db.expense.findFirst({ where: { id: expenseId, businessId, deletedAt: null } });
    if (!expense) throw new Error("Expense not found");
  }
  if (bankTransactionId) {
    const txn = await db.bankTransaction.findFirst({ where: { id: bankTransactionId, businessId } });
    if (!txn) throw new Error("Bank transaction not found");
  }
  await assertBusinessRefs(businessId, { projectId, vendorId, employeeId, customerId });
  if (expenseId && bankTransactionId) {
    await db.bankTransaction.updateMany({
      where: { id: bankTransactionId, businessId, matchedExpenseId: null, personal: false },
      data: { matchedExpenseId: expenseId, reconciliation: "MATCHED" },
    });
  }
  const existing = await db.recordAssociation.findFirst({
    where: { businessId, receiptId, documentId, expenseId, bankTransactionId, projectId, vendorId, employeeId, customerId },
  });
  if (existing) return { id: existing.id, created: false };
  const created = await db.recordAssociation.create({
    data: { businessId, receiptId, documentId, expenseId, bankTransactionId, projectId, vendorId, employeeId, customerId, createdById: ctx.employee.id },
  });
  return { id: created.id, created: true };
}

export async function importBankStatement(
  ctx: AuthContext,
  input: { fileName: string; mimeType: string; buffer: Buffer; accountName: string },
) {
  if (!canImportStatements(ctx)) throw new Error(`Missing permission: ${PERMISSIONS.IMPORT_DATA}`);
  if (input.buffer.byteLength > IMPORT_BYTE_LIMIT) throw new Error("Invalid statement: file is larger than 1.5 MB");
  const lower = input.fileName.toLowerCase();
  if (lower.endsWith(".pdf") || input.mimeType.includes("pdf")) {
    throw new Error("Invalid statement: PDF files stay in Bank statements. Import a CSV or Excel export to categorize rows.");
  }
  const table = lower.endsWith(".xlsx") || input.mimeType.includes("spreadsheet")
    ? await parseXlsx(input.buffer)
    : parseTextTable(input.buffer.toString("utf8"), input.fileName.endsWith(".csv") ? input.fileName : `${input.fileName}.csv`);
  const accountName = input.accountName.trim() || "Imported statement";
  const parsed = parseStatementTable(table.headers, table.rows, accountName);
  if (parsed.rows.length === 0 && parsed.invalidRows > 0) throw new Error("Invalid statement: no transaction rows were readable");
  const businessId = ctx.business.id;
  const dupes = parsed.rows.length
    ? await db.bankTransaction.findMany({
        where: { businessId, source: "STATEMENT", externalId: { in: parsed.rows.map((row) => row.externalId) } },
        select: { externalId: true },
      })
    : [];
  const seen = new Set(dupes.map((row) => row.externalId));
  const fresh = parsed.rows.filter((row) => !seen.has(row.externalId));
  const context = await categorizationContext(businessId);
  const hash = createHash("sha256").update(input.buffer).digest("hex");
  const dates = fresh.map((row) => row.postedOn).sort();
  const statement = await db.bankStatement.create({
    data: {
      businessId,
      uploadedById: ctx.employee.id,
      title: input.fileName,
      accountName,
      periodStart: dates[0] ? dayStart(dates[0]) : null,
      periodEnd: dates.at(-1) ? dayStart(dates.at(-1) as string) : null,
      fileName: input.fileName,
      mimeType: input.mimeType || "text/csv",
      sizeBytes: input.buffer.byteLength,
      storageUrl: `database://${hash}`,
      data: input.buffer,
      contentHash: hash,
    },
  });
  let account = await db.bankAccount.findFirst({ where: { businessId, connectionId: null, name: accountName } });
  if (!account) {
    account = await db.bankAccount.create({
      data: { businessId, name: accountName, kind: "CHECKING", currency: "USD" },
    });
  }
  for (const row of fresh) {
    const suggestion = suggestCategory({
      merchant: row.merchant,
      description: row.description,
      rules: context.rules,
      categoriesByName: context.categoriesByName,
    });
    await db.bankTransaction.create({
      data: {
        businessId,
        accountId: account.id,
        source: "STATEMENT",
        externalId: row.externalId,
        statementId: statement.id,
        postedOn: dayStart(row.postedOn),
        rawDescription: row.description.slice(0, 500),
        rawMerchant: row.merchant,
        amount: row.amount,
        rawBalance: row.balance,
        categoryId: suggestion.applied ? suggestion.categoryId : null,
        suggestedCategoryId: suggestion.categoryId,
        suggestionReason: suggestion.reason,
        reconciliation: suggestion.applied && suggestion.categoryId ? "CATEGORIZED" : "UNREVIEWED",
      },
    });
  }
  await createAuditLog({
    businessId,
    employeeId: ctx.employee.id,
    action: "SETTINGS_CHANGE",
    entity: "BankStatement",
    entityId: statement.id,
    details: { kind: "BANK_STATEMENT_IMPORTED", imported: fresh.length, skipped: parsed.skippedDuplicates + (parsed.rows.length - fresh.length), invalid: parsed.invalidRows },
  });
  return {
    statementId: statement.id,
    imported: fresh.length,
    skipped: parsed.skippedDuplicates + (parsed.rows.length - fresh.length),
    invalid: parsed.invalidRows,
  };
}

export type ReportQuery = { preset?: string; from?: string; to?: string; category?: string };

function resolveRange(query: ReportQuery): { preset: ReportPreset; from: string; to: string } {
  const preset = isReportPreset(query.preset) ? query.preset : "this_month";
  const today = new Date().toISOString().slice(0, 10);
  const range = reportRange(preset, today, { from: query.from, to: query.to });
  return { preset, ...range };
}

export async function profitAndLossReport(ctx: AuthContext, query: ReportQuery) {
  assertReports(ctx);
  const { preset, from, to } = resolveRange(query);
  const businessId = ctx.business.id;
  const [orders, expenses, bank] = await Promise.all([
    db.order.findMany({
      where: { businessId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: { gte: dayStart(from), lte: dayEnd(to) } },
      select: { id: true, orderNumber: true, status: true, total: true, paidAt: true, refunds: { select: { amount: true } } },
      take: REPORT_TAKE,
    }),
    db.expense.findMany({
      where: { businessId, deletedAt: null, status: { in: [...APPROVED] }, purchaseDate: { gte: dayStart(from), lte: dayStart(to) } },
      select: { id: true, merchant: true, total: true, purchaseDate: true, category: { select: { name: true } } },
      take: REPORT_TAKE,
    }),
    db.bankTransaction.findMany({
      where: { businessId, postedOn: { gte: dayStart(from), lte: dayStart(to) } },
      select: { id: true, amount: true, postedOn: true, rawDescription: true, rawMerchant: true, personal: true, matchedExpenseId: true, category: { select: { name: true } } },
      take: REPORT_TAKE,
    }),
  ]);
  const built = buildProfitAndLoss({
    orders: orders.map((order) => ({
      id: order.id,
      status: order.status,
      totalCents: cents(order.total),
      refundCents: order.refunds.reduce((sum, refund) => sum + cents(refund.amount), 0),
    })),
    expenses: expenses.map((expense) => ({ id: expense.id, categoryName: expense.category?.name ?? null, amountCents: cents(expense.total) })),
    bank: bank.map((txn) => ({
      id: txn.id,
      amountCents: cents(txn.amount),
      personal: txn.personal,
      matchedExpenseId: txn.matchedExpenseId,
      categoryName: txn.category?.name ?? null,
    })),
  });
  const details = new Map<string, { id: string; date: string; description: string; amount: number; kind: string }>();
  for (const order of orders) {
    const refund = order.refunds.reduce((sum, row) => sum + cents(row.amount), 0);
    details.set(order.id, {
      id: order.id,
      date: order.paidAt ? isoDate(order.paidAt) : from,
      description: `Order ${order.orderNumber}`,
      amount: (cents(order.total) - refund) / 100,
      kind: "order",
    });
  }
  for (const expense of expenses) {
    details.set(expense.id, {
      id: expense.id,
      date: isoDate(expense.purchaseDate),
      description: expense.merchant,
      amount: Number(expense.total),
      kind: "expense",
    });
  }
  for (const txn of bank) {
    details.set(txn.id, {
      id: txn.id,
      date: isoDate(txn.postedOn),
      description: txn.rawMerchant || txn.rawDescription,
      amount: Math.abs(Number(txn.amount)),
      kind: "bank",
    });
  }
  const decorate = (lines: { label: string; cents: number; ids: string[] }[]) =>
    lines.map((line) => ({
      label: line.label,
      total: line.cents / 100,
      ids: line.ids,
      items: line.ids.flatMap((id) => {
        const item = details.get(id);
        return item ? [item] : [];
      }),
    }));
  return {
    preset,
    from,
    to,
    income: built.incomeCents / 100,
    expenses: built.expenseCents / 100,
    net: built.netCents / 100,
    incomeLines: decorate(built.incomeLines),
    expenseLines: decorate(built.expenseLines),
    selectedCategory: query.category || null,
    truncated: orders.length >= REPORT_TAKE || expenses.length >= REPORT_TAKE || bank.length >= REPORT_TAKE,
  };
}

async function taxSource(ctx: AuthContext, query: ReportQuery) {
  assertReports(ctx);
  const { preset, from, to } = resolveRange(query);
  const businessId = ctx.business.id;
  const [expenses, bank, mappings, categories] = await Promise.all([
    db.expense.findMany({
      where: { businessId, deletedAt: null, status: { in: [...APPROVED] }, purchaseDate: { gte: dayStart(from), lte: dayStart(to) } },
      select: {
        id: true,
        merchant: true,
        total: true,
        purchaseDate: true,
        categoryId: true,
        category: { select: { name: true } },
        receipts: { where: { deletedAt: null }, select: { id: true }, take: 1 },
      },
      take: REPORT_TAKE,
    }),
    db.bankTransaction.findMany({
      where: { businessId, postedOn: { gte: dayStart(from), lte: dayStart(to) }, personal: false, matchedExpenseId: null, amount: { lt: 0 } },
      select: {
        id: true,
        amount: true,
        postedOn: true,
        rawDescription: true,
        rawMerchant: true,
        categoryId: true,
        category: { select: { name: true } },
        associations: { where: { receiptId: { not: null } }, select: { receiptId: true } },
      },
      take: REPORT_TAKE,
    }),
    db.taxCategoryMapping.findMany({ where: { businessId }, select: { categoryId: true, taxLabel: true } }),
    db.expenseCategory.findMany({ where: { businessId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const items = new Map<string, { id: string; date: string; description: string; amount: number; kind: string }>();
  const lines = [
    ...expenses.map((expense) => {
      items.set(expense.id, { id: expense.id, date: isoDate(expense.purchaseDate), description: expense.merchant, amount: Number(expense.total), kind: "expense" });
      return {
        id: expense.id,
        categoryId: expense.categoryId,
        categoryName: expense.category?.name ?? null,
        amountCents: cents(expense.total),
        hasReceipt: expense.receipts.length > 0,
      };
    }),
    ...bank.map((txn) => {
      items.set(txn.id, {
        id: txn.id,
        date: isoDate(txn.postedOn),
        description: txn.rawMerchant || txn.rawDescription,
        amount: Math.abs(Number(txn.amount)),
        kind: "bank",
      });
      return {
        id: txn.id,
        categoryId: txn.categoryId,
        categoryName: txn.category?.name ?? null,
        amountCents: Math.abs(cents(txn.amount)),
        hasReceipt: txn.associations.length > 0,
      };
    }),
  ];
  const rows = buildTaxSummary(lines, mappings).map((row) => ({
    ...row,
    total: row.totalCents / 100,
    items: row.ids.flatMap((id) => {
      const item = items.get(id);
      return item ? [item] : [];
    }),
  }));
  const labelByCategory = new Map(mappings.map((mapping) => [mapping.categoryId, mapping.taxLabel]));
  return {
    preset,
    from,
    to,
    disclaimer: TAX_SUMMARY_DISCLAIMER,
    rows,
    categories: categories.map((category) => ({ id: category.id, name: category.name, taxLabel: labelByCategory.get(category.id) ?? "" })),
    truncated: expenses.length >= REPORT_TAKE || bank.length >= REPORT_TAKE,
    expenses,
    bank,
  };
}

export async function taxSummaryReport(ctx: AuthContext, query: ReportQuery) {
  const report = await taxSource(ctx, query);
  return {
    preset: report.preset,
    from: report.from,
    to: report.to,
    disclaimer: report.disclaimer,
    rows: report.rows,
    categories: report.categories,
    truncated: report.truncated,
  };
}

export async function saveTaxMapping(ctx: AuthContext, input: { categoryId: string; taxLabel: string }) {
  if (!canEditBankTransactions(ctx) && !canViewProfitAndLoss(ctx)) throw new Error("Missing permission: view_expense_reports");
  const taxLabel = input.taxLabel.trim();
  if (!taxLabel) throw new Error("Invalid mapping: a label is required");
  if (/deductib/i.test(taxLabel)) throw new Error("Invalid mapping: EmeraldOne does not store a deductibility decision");
  const category = await db.expenseCategory.findFirst({ where: { id: input.categoryId, businessId: ctx.business.id, deletedAt: null } });
  if (!category) throw new Error("Expense category not found");
  await db.taxCategoryMapping.upsert({
    where: { categoryId: category.id },
    create: { businessId: ctx.business.id, categoryId: category.id, taxLabel },
    update: { taxLabel },
  });
  return { categoryId: category.id, taxLabel };
}

export async function taxSummaryDownload(ctx: AuthContext, query: ReportQuery, format: "csv" | "pdf" | "xlsx" | "receipts") {
  if (!canExportTaxSummary(ctx)) throw new Error("Missing permission: export_expenses");
  const report = await taxSource(ctx, query);
  if (format === "csv") return { body: Buffer.from(taxSummaryCsv(report.rows)), contentType: "text/csv; charset=utf-8", filename: "tax-summary.csv" };
  if (format === "pdf") {
    const pdf = await taxSummaryPdf({ businessName: ctx.business.name, from: report.from, to: report.to, rows: report.rows });
    return { body: pdf, contentType: "application/pdf", filename: "tax-summary.pdf" };
  }
  if (format === "xlsx") {
    const xlsx = await taxSummaryXlsx(report.rows);
    return { body: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "tax-summary.xlsx" };
  }
  const receiptIds = report.bank.flatMap((txn) => txn.associations.map((association) => association.receiptId).filter((id): id is string => Boolean(id)));
  const expenseIds = report.expenses.map((expense) => expense.id);
  const or = [
    ...(expenseIds.length ? [{ expenseId: { in: expenseIds } }] : []),
    ...(receiptIds.length ? [{ id: { in: receiptIds } }] : []),
  ];
  const linked = or.length
    ? await db.expenseReceipt.findMany({
        where: { deletedAt: null, expense: { businessId: ctx.business.id }, OR: or },
        select: { id: true, fileName: true, data: true },
        take: 40,
      })
    : [];
  const files = linked.map((receipt) => ({ name: receipt.fileName, data: receipt.data ? Buffer.from(receipt.data) : null }));
  const zipped = await receiptZip(files);
  return { body: zipped.zip, contentType: "application/zip", filename: "tax-summary-receipts.zip" };
}
