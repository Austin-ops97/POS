import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { SEARCH_TAKE, expenseSearchOwnOnly, searchKindsFor, type SearchKind } from "./scopes";

export type SearchHit = {
  kind: SearchKind;
  label: string;
  href: string;
  detail?: string;
};

function contains(q: string) {
  return { contains: q, mode: "insensitive" as const };
}

export async function searchBusiness(ctx: AuthContext, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const keys = ctx.employee.role.permissions.map((row) => row.permission.key);
  const isOwner = ctx.employee.role.name === "Owner";
  const kinds = new Set(searchKindsFor(keys, isOwner));
  const businessId = ctx.business.id;
  const ownExpenses = expenseSearchOwnOnly(keys, isOwner);
  const hits: SearchHit[] = [];

  if (kinds.has("product")) {
    const products = await db.product.findMany({
      where: {
        businessId,
        deletedAt: null,
        OR: [{ name: contains(q) }, { sku: contains(q) }, { barcode: contains(q) }],
      },
      select: { id: true, name: true, sku: true },
      take: SEARCH_TAKE,
    });
    hits.push(...products.map((product) => ({ kind: "product" as const, label: product.name, href: `/products/${product.id}`, detail: product.sku || undefined })));
  }

  if (kinds.has("customer")) {
    const customers = await db.customer.findMany({
      where: {
        businessId,
        deletedAt: null,
        OR: [{ firstName: contains(q) }, { lastName: contains(q) }, { email: contains(q) }, { phone: contains(q) }],
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      take: SEARCH_TAKE,
    });
    hits.push(...customers.map((customer) => ({
      kind: "customer" as const,
      label: `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ""}`,
      href: `/customers/${customer.id}`,
      detail: customer.email || customer.phone || undefined,
    })));
  }

  if (kinds.has("employee")) {
    const employees = await db.employeeProfile.findMany({
      where: {
        businessId,
        deletedAt: null,
        archivedAt: null,
        OR: [{ name: contains(q) }, { email: contains(q) }, { jobTitle: contains(q) }, { employeeNumber: contains(q) }],
      },
      select: { id: true, name: true, jobTitle: true },
      take: SEARCH_TAKE,
    });
    hits.push(...employees.map((employee) => ({ kind: "employee" as const, label: employee.name, href: `/employees/${employee.id}`, detail: employee.jobTitle || undefined })));
  }

  if (kinds.has("vendor")) {
    const vendors = await db.expenseVendor.findMany({
      where: { businessId, deletedAt: null, name: contains(q) },
      select: { id: true, name: true },
      take: SEARCH_TAKE,
    });
    hits.push(...vendors.map((vendor) => ({ kind: "vendor" as const, label: vendor.name, href: "/finance/expenses", detail: "Vendor" })));
  }

  if (kinds.has("project")) {
    const projects = await db.officeWorkspaceRecord.findMany({
      where: { businessId, workspace: "projects", archivedAt: null, title: contains(q) },
      select: { id: true, title: true },
      take: SEARCH_TAKE,
    });
    hits.push(...projects.map((project) => ({ kind: "project" as const, label: project.title, href: "/office/apps/projects", detail: "Project" })));
  }

  if (kinds.has("transaction")) {
    const transactions = await db.bankTransaction.findMany({
      where: {
        businessId,
        OR: [{ rawDescription: contains(q) }, { rawMerchant: contains(q) }],
      },
      select: { id: true, rawMerchant: true, rawDescription: true, postedOn: true },
      orderBy: { postedOn: "desc" },
      take: SEARCH_TAKE,
    });
    hits.push(...transactions.map((txn) => ({
      kind: "transaction" as const,
      label: txn.rawMerchant || txn.rawDescription,
      href: `/finance/transactions?q=${encodeURIComponent(q)}`,
      detail: txn.postedOn.toISOString().slice(0, 10),
    })));
  }

  if (kinds.has("expense") || kinds.has("receipt")) {
    const expenseWhere = {
      businessId,
      deletedAt: null,
      ...(ownExpenses ? { employeeId: ctx.employee.id } : {}),
    };
    if (kinds.has("expense")) {
      const expenses = await db.expense.findMany({
        where: {
          ...expenseWhere,
          OR: [{ merchant: contains(q) }, { receiptNumber: contains(q) }, { ocrRawText: contains(q) }],
        },
        select: { id: true, merchant: true, receiptNumber: true },
        orderBy: { purchaseDate: "desc" },
        take: SEARCH_TAKE,
      });
      hits.push(...expenses.map((expense) => ({ kind: "expense" as const, label: expense.merchant, href: `/finance/expenses/${expense.id}`, detail: expense.receiptNumber || "Expense" })));
    }
    if (kinds.has("receipt")) {
      const receipts = await db.expenseReceipt.findMany({
        where: {
          deletedAt: null,
          expense: expenseWhere,
          OR: [{ fileName: contains(q) }, { ocrText: contains(q) }],
        },
        select: { id: true, fileName: true, expense: { select: { id: true, merchant: true } } },
        orderBy: { createdAt: "desc" },
        take: SEARCH_TAKE,
      });
      hits.push(...receipts.map((receipt) => ({
        kind: "receipt" as const,
        label: receipt.expense.merchant,
        href: `/finance/expenses/${receipt.expense.id}`,
        detail: receipt.fileName,
      })));
    }
  }

  if (kinds.has("document")) {
    const canSensitive = isOwner || keys.includes(PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS);
    const documents = await db.officeDocument.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(canSensitive ? {} : { isSensitive: false }),
        OR: [{ title: contains(q) }, { description: contains(q) }],
      },
      select: { id: true, title: true, kind: true },
      take: SEARCH_TAKE,
    });
    hits.push(...documents.map((document) => ({ kind: "document" as const, label: document.title, href: `/office/documents/${document.id}`, detail: document.kind === "SCAN" ? "Scanned document" : "Document" })));
  }

  if (kinds.has("invoice")) {
    const orders = await db.order.findMany({
      where: { businessId, orderNumber: contains(q) },
      select: { id: true, orderNumber: true, status: true },
      orderBy: { createdAt: "desc" },
      take: SEARCH_TAKE,
    });
    hits.push(...orders.map((order) => ({ kind: "invoice" as const, label: order.orderNumber, href: `/orders/${order.id}`, detail: order.status })));
  }

  return hits;
}
