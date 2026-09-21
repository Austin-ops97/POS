import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { normalizeVendorName } from "@/lib/expenses/constants";
import {
  detectEntity,
  emptyExistingIndex,
  errorReportCsv,
  externalKey,
  importBatchWhere,
  isCommitEntity,
  normalizeEmail,
  normalizeKey,
  normalizePhone,
  parseImportDate,
  parseMoney,
  parseTextTable,
  planImport,
  rollbackTargets,
  suggestMapping,
  type CommitEntity,
  type ExistingIndex,
  type FieldMapping,
  type ParsedTable,
} from "./import-plan";
import { parseXlsx } from "./parse-xlsx";

const PAYMENT_METHODS = new Set(["COMPANY_CARD", "PERSONAL_CARD", "CASH", "BANK_TRANSFER", "OTHER"]);

function paymentMethod(value: string): "COMPANY_CARD" | "PERSONAL_CARD" | "CASH" | "BANK_TRANSFER" | "OTHER" {
  const token = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (token.includes("CASH")) return "CASH";
  if (token.includes("PERSONAL")) return "PERSONAL_CARD";
  if (token.includes("BANK") || token.includes("CHECK") || token.includes("ACH")) return "BANK_TRANSFER";
  if (token.includes("CARD") || token.includes("VISA") || token.includes("CREDIT")) return "COMPANY_CARD";
  if (PAYMENT_METHODS.has(token)) return token as "OTHER";
  return "OTHER";
}

async function existingIndex(businessId: string, entityType: CommitEntity, source: string): Promise<ExistingIndex> {
  const index = emptyExistingIndex();
  const links = await db.importExternalId.findMany({
    where: { businessId, entityType, source },
    select: { externalId: true, entityId: true },
  });
  for (const link of links) index.externalIds[externalKey(entityType, link.externalId)] = link.entityId;
  if (entityType === "CUSTOMER") {
    const rows = await db.customer.findMany({
      where: { businessId, deletedAt: null },
      select: { id: true, email: true, phone: true },
    });
    for (const row of rows) {
      const email = row.email ? normalizeEmail(row.email) : "";
      const phone = row.phone ? normalizePhone(row.phone) : "";
      if (email) index.customersByEmail[email] = row.id;
      if (phone) index.customersByPhone[phone] = row.id;
    }
  }
  if (entityType === "VENDOR") {
    const rows = await db.expenseVendor.findMany({
      where: { businessId, deletedAt: null },
      select: { id: true, normalizedName: true, phone: true },
    });
    for (const row of rows) {
      if (row.normalizedName) index.vendorsByName[row.normalizedName] = row.id;
      const phone = row.phone ? normalizePhone(row.phone) : "";
      if (phone) index.vendorsByPhone[phone] = row.id;
    }
  }
  if (entityType === "PRODUCT") {
    const rows = await db.product.findMany({
      where: { businessId, deletedAt: null },
      select: { id: true, sku: true, barcode: true },
    });
    for (const row of rows) {
      if (row.sku) index.productsBySku[normalizeKey(row.sku)] = row.id;
      if (row.barcode) index.productsByBarcode[row.barcode.trim()] = row.id;
    }
  }
  if (entityType === "EXPENSE") {
    const rows = await db.expense.findMany({
      where: { businessId, deletedAt: null, receiptNumber: { not: null } },
      select: { id: true, merchant: true, receiptNumber: true },
    });
    for (const row of rows) {
      if (!row.receiptNumber) continue;
      index.expensesByReceipt[`${normalizeKey(row.merchant)}|${normalizeKey(row.receiptNumber)}`] = row.id;
    }
  }
  return index;
}

export async function parseUpload(fileName: string, bytes: Buffer): Promise<ParsedTable> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx")) return parseXlsx(bytes);
  return parseTextTable(bytes.toString("utf8"), fileName);
}

export async function createImportBatch(input: {
  businessId: string;
  employeeId: string;
  fileName: string;
  table: ParsedTable;
  source?: string;
}) {
  const detected = detectEntity(input.table.headers, input.table.format, input.table.iifType);
  const entityType = detected.entityType;
  const mapping = isCommitEntity(entityType) ? suggestMapping(entityType, input.table.headers) : {};
  const batch = await db.importBatch.create({
    data: {
      businessId: input.businessId,
      createdById: input.employeeId,
      fileName: input.fileName,
      sourceFormat: input.table.format,
      source: input.source ?? "FILE",
      entityType,
      headers: input.table.headers,
      mapping,
      rowCount: input.table.rows.length,
      rows: {
        create: input.table.rows.map((cells, index) => ({
          businessId: input.businessId,
          rowNumber: index + 2,
          entityType,
          raw: { cells },
        })),
      },
    },
  });
  return { id: batch.id, entityType, headers: input.table.headers, mapping, rowCount: input.table.rows.length, detectedScores: detected.scores };
}

export async function previewImportBatch(input: {
  businessId: string;
  batchId: string;
  entityType: string;
  mapping: FieldMapping;
}) {
  const batch = await db.importBatch.findFirst({
    where: importBatchWhere(input.businessId, input.batchId),
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) throw new Error("Import batch not found");
  if (batch.status === "IMPORTED" || batch.status === "ROLLED_BACK") {
    throw new Error("Invalid import: this batch can no longer be previewed");
  }
  const headers = batch.headers as string[];
  const matrix = batch.rows.map((row) => ((row.raw as { cells?: string[] }).cells ?? []));
  const existing = isCommitEntity(input.entityType) ? await existingIndex(input.businessId, input.entityType, batch.source) : emptyExistingIndex();
  const plan = planImport({ entityType: input.entityType, headers, rows: matrix, mapping: input.mapping, existing });
  if (!plan.committable) {
    await db.importBatch.update({
      where: { id: batch.id },
      data: { entityType: input.entityType, mapping: input.mapping, status: "PREVIEWED", failedCount: 0, skippedCount: plan.counts.skipped },
    });
    return { ...plan, batchId: batch.id, message: `${input.entityType} files can be detected, but only customers, vendors, products, and expenses can be imported.` };
  }
  await db.$transaction(async (tx) => {
    for (const planned of plan.rows) {
      const stored = batch.rows.find((row) => row.rowNumber === planned.rowNumber);
      if (!stored) continue;
      await tx.importBatchRow.update({
        where: { id: stored.id },
        data: {
          entityType: input.entityType,
          action: planned.action,
          externalId: planned.externalId,
          entityId: planned.matchEntityId,
          message: [...planned.errors, ...planned.warnings].join("; ") || null,
          normalized: planned.normalized,
        },
      });
    }
    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        entityType: input.entityType,
        mapping: input.mapping,
        status: "PREVIEWED",
        failedCount: plan.counts.invalid,
        skippedCount: plan.counts.skipped,
      },
    });
  });
  return { ...plan, batchId: batch.id, message: null as string | null };
}

async function rememberExternalId(tx: Prisma.TransactionClient, input: {
  businessId: string;
  entityType: string;
  entityId: string;
  source: string;
  externalId: string | null;
  batchId: string;
}) {
  if (!input.externalId) return;
  await tx.importExternalId.upsert({
    where: {
      businessId_entityType_source_externalId: {
        businessId: input.businessId,
        entityType: input.entityType,
        source: input.source,
        externalId: input.externalId,
      },
    },
    create: {
      businessId: input.businessId,
      entityType: input.entityType,
      entityId: input.entityId,
      source: input.source,
      externalId: input.externalId,
      batchId: input.batchId,
    },
    update: { entityId: input.entityId, batchId: input.batchId },
  });
}

export async function commitImportBatch(input: { businessId: string; employeeId: string; batchId: string }) {
  const batch = await db.importBatch.findFirst({
    where: importBatchWhere(input.businessId, input.batchId),
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) throw new Error("Import batch not found");
  if (!isCommitEntity(batch.entityType)) throw new Error(`Invalid import: ${batch.entityType} cannot be imported`);
  if (batch.status !== "PREVIEWED") throw new Error("Invalid import: preview the file before importing");
  const categories = batch.entityType === "EXPENSE"
    ? await db.expenseCategory.findMany({
        where: { businessId: input.businessId, deletedAt: null, isActive: true },
        select: { id: true, name: true },
      })
    : [];
  let imported = 0;
  let updated = 0;
  let skipped = batch.rows.filter((row) => row.action === "SKIPPED").length;
  let failed = batch.rows.filter((row) => row.action === "INVALID").length;
  const workable = batch.rows.filter((row) => row.action === "VALID" || row.action === "DUPLICATE");
  for (let offset = 0; offset < workable.length; offset += 100) {
    const chunk = workable.slice(offset, offset + 100);
    await db.$transaction(async (tx) => {
      for (const row of chunk) {
        const values = (row.normalized ?? {}) as Record<string, string>;
        try {
          const result = await applyRow(tx, {
            businessId: input.businessId,
            employeeId: input.employeeId,
            entityType: batch.entityType as CommitEntity,
            source: batch.source,
            batchId: batch.id,
            rowId: row.id,
            matchEntityId: row.entityId,
            externalId: row.externalId,
            values,
            categories,
          });
          if (result.action === "CREATED") imported += 1;
          if (result.action === "UPDATED") updated += 1;
          if (result.action === "SKIPPED" || result.action === "FAILED") {
            if (result.action === "FAILED") failed += 1;
            else skipped += 1;
          }
        } catch (error) {
          failed += 1;
          await tx.importBatchRow.update({
            where: { id: row.id },
            data: { action: "FAILED", message: error instanceof Error ? error.message : "Import row failed" },
          });
        }
      }
    }, { timeout: 20000 });
  }
  await db.importBatch.update({
    where: { id: batch.id },
    data: {
      status: failed && !imported && !updated ? "FAILED" : "IMPORTED",
      importedCount: imported,
      updatedCount: updated,
      skippedCount: skipped,
      failedCount: failed,
      importedAt: new Date(),
    },
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "SETTINGS_CHANGE",
    entity: "ImportBatch",
    entityId: batch.id,
    details: {
      kind: "IMPORT_COMPLETED",
      batchId: batch.id,
      entityType: batch.entityType,
      source: batch.source,
      imported,
      updated,
      skipped,
      failed,
    },
  });
  return { id: batch.id, imported, updated, skipped, failed };
}

async function applyRow(tx: Prisma.TransactionClient, input: {
  businessId: string;
  employeeId: string;
  entityType: CommitEntity;
  source: string;
  batchId: string;
  rowId: string;
  matchEntityId: string | null;
  externalId: string | null;
  values: Record<string, string>;
  categories: Array<{ id: string; name: string }>;
}): Promise<{ action: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED" }> {
  if (input.entityType === "CUSTOMER") return applyCustomer(tx, input);
  if (input.entityType === "VENDOR") return applyVendor(tx, input);
  if (input.entityType === "PRODUCT") return applyProduct(tx, input);
  return applyExpense(tx, input);
}

async function applyCustomer(tx: Prisma.TransactionClient, input: Parameters<typeof applyRow>[1]): Promise<{ action: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED" }> {
  const data = {
    firstName: input.values.firstName,
    lastName: input.values.lastName || null,
    email: input.values.email || null,
    phone: input.values.phone || null,
    address: input.values.address || null,
    notes: input.values.notes || null,
  };
  if (input.matchEntityId) {
    const current = await tx.customer.findFirst({ where: { id: input.matchEntityId, businessId: input.businessId, deletedAt: null } });
    if (!current) return fail(tx, input.rowId, "Matched customer is not in this business");
    const previous = { firstName: current.firstName, lastName: current.lastName, email: current.email, phone: current.phone, address: current.address, notes: current.notes };
    await tx.customer.update({
      where: { id: current.id },
      data: {
        firstName: data.firstName || current.firstName,
        lastName: data.lastName ?? current.lastName,
        email: data.email ?? current.email,
        phone: data.phone ?? current.phone,
        address: data.address ?? current.address,
        notes: data.notes ?? current.notes,
      },
    });
    await rememberExternalId(tx, { ...input, entityId: current.id });
    await tx.importBatchRow.update({ where: { id: input.rowId }, data: { action: "UPDATED", entityId: current.id, previous } });
    return { action: "UPDATED" };
  }
  const created = await tx.customer.create({ data: { businessId: input.businessId, ...data, firstName: data.firstName } });
  await rememberExternalId(tx, { ...input, entityId: created.id });
  await tx.importBatchRow.update({ where: { id: input.rowId }, data: { action: "CREATED", entityId: created.id } });
  return { action: "CREATED" };
}

async function applyVendor(tx: Prisma.TransactionClient, input: Parameters<typeof applyRow>[1]): Promise<{ action: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED" }> {
  const normalizedName = normalizeVendorName(input.values.name);
  if (!normalizedName) return fail(tx, input.rowId, "Vendor name is empty");
  if (input.matchEntityId) {
    const current = await tx.expenseVendor.findFirst({ where: { id: input.matchEntityId, businessId: input.businessId, deletedAt: null } });
    if (!current) return fail(tx, input.rowId, "Matched vendor is not in this business");
    const previous = { name: current.name, phone: current.phone, address: current.address, website: current.website, notes: current.notes };
    await tx.expenseVendor.update({
      where: { id: current.id },
      data: {
        name: input.values.name || current.name,
        phone: input.values.phone || current.phone,
        address: input.values.address || current.address,
        website: input.values.website || current.website,
        notes: input.values.notes || current.notes,
      },
    });
    await rememberExternalId(tx, { ...input, entityId: current.id });
    await tx.importBatchRow.update({ where: { id: input.rowId }, data: { action: "UPDATED", entityId: current.id, previous } });
    return { action: "UPDATED" };
  }
  const created = await tx.expenseVendor.create({
    data: {
      businessId: input.businessId,
      name: input.values.name,
      normalizedName,
      phone: input.values.phone || null,
      address: input.values.address || null,
      website: input.values.website || null,
      notes: input.values.notes || null,
    },
  });
  await rememberExternalId(tx, { ...input, entityId: created.id });
  await tx.importBatchRow.update({ where: { id: input.rowId }, data: { action: "CREATED", entityId: created.id } });
  return { action: "CREATED" };
}

async function applyProduct(tx: Prisma.TransactionClient, input: Parameters<typeof applyRow>[1]): Promise<{ action: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED" }> {
  const price = parseMoney(input.values.price);
  if (!price) return fail(tx, input.rowId, "Price is required");
  const cost = input.values.cost ? parseMoney(input.values.cost) : null;
  if (input.matchEntityId) {
    const current = await tx.product.findFirst({ where: { id: input.matchEntityId, businessId: input.businessId, deletedAt: null } });
    if (!current) return fail(tx, input.rowId, "Matched product is not in this business");
    const previous = { name: current.name, sku: current.sku, barcode: current.barcode, price: current.price.toString(), cost: current.cost?.toString() ?? null, description: current.description };
    await tx.product.update({
      where: { id: current.id },
      data: {
        name: input.values.name || current.name,
        sku: input.values.sku || current.sku,
        barcode: input.values.barcode || current.barcode,
        price,
        cost: cost ?? current.cost,
        description: input.values.description || current.description,
      },
    });
    await rememberExternalId(tx, { ...input, entityId: current.id });
    await tx.importBatchRow.update({ where: { id: input.rowId }, data: { action: "UPDATED", entityId: current.id, previous } });
    return { action: "UPDATED" };
  }
  const created = await tx.product.create({
    data: {
      businessId: input.businessId,
      name: input.values.name,
      sku: input.values.sku || null,
      barcode: input.values.barcode || null,
      price,
      cost,
      description: input.values.description || null,
    },
  });
  await rememberExternalId(tx, { ...input, entityId: created.id });
  await tx.importBatchRow.update({ where: { id: input.rowId }, data: { action: "CREATED", entityId: created.id } });
  return { action: "CREATED" };
}

async function applyExpense(tx: Prisma.TransactionClient, input: Parameters<typeof applyRow>[1]): Promise<{ action: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED" }> {
  if (input.matchEntityId) {
    await tx.importBatchRow.update({
      where: { id: input.rowId },
      data: { action: "SKIPPED", entityId: input.matchEntityId, message: "Matched an existing expense and was not imported again" },
    });
    return { action: "SKIPPED" };
  }
  const date = parseImportDate(input.values.purchaseDate);
  const total = parseMoney(input.values.total) ?? parseMoney(input.values.amount);
  if (!date || !total) return fail(tx, input.rowId, "Expense needs a date and total");
  const tax = parseMoney(input.values.tax) ?? "0.00";
  const tip = parseMoney(input.values.tip) ?? "0.00";
  const amount = parseMoney(input.values.amount) ?? total;
  const category = input.categories.find((item) => normalizeKey(item.name) === normalizeKey(input.values.category ?? ""));
  const vendorName = normalizeVendorName(input.values.merchant);
  let vendorId: string | null = null;
  if (vendorName) {
    const vendor = await tx.expenseVendor.upsert({
      where: { businessId_normalizedName: { businessId: input.businessId, normalizedName: vendorName } },
      create: { businessId: input.businessId, name: input.values.merchant, normalizedName: vendorName },
      update: { deletedAt: null },
    });
    vendorId = vendor.id;
  }
  const created = await tx.expense.create({
    data: {
      businessId: input.businessId,
      employeeId: input.employeeId,
      submittedById: input.employeeId,
      vendorId,
      categoryId: category?.id ?? null,
      merchant: input.values.merchant,
      amount,
      tax,
      tip,
      total,
      purchaseDate: new Date(`${date}T00:00:00.000Z`),
      paymentMethod: paymentMethod(input.values.paymentMethod ?? ""),
      receiptNumber: input.values.receiptNumber || null,
      notes: input.values.notes || null,
      status: "DRAFT",
      missingReceipt: true,
      entryMode: "SIMPLE",
    },
  });
  await rememberExternalId(tx, { ...input, entityId: created.id });
  const warning = input.values.category && !category ? "Category was not matched, so the expense has no category." : null;
  await tx.importBatchRow.update({
    where: { id: input.rowId },
    data: { action: "CREATED", entityId: created.id, message: warning },
  });
  return { action: "CREATED" };
}

async function fail(tx: Prisma.TransactionClient, rowId: string, message: string): Promise<{ action: "FAILED" }> {
  await tx.importBatchRow.update({ where: { id: rowId }, data: { action: "FAILED", message } });
  return { action: "FAILED" };
}

export async function importErrorReport(businessId: string, batchId: string): Promise<string> {
  const rows = await db.importBatchRow.findMany({
    where: { businessId, batchId, batch: { businessId } },
    orderBy: { rowNumber: "asc" },
    select: { rowNumber: true, action: true, message: true },
  });
  if (!rows.length) throw new Error("Import batch not found");
  return errorReportCsv(rows);
}

export async function rollbackImportBatch(input: { businessId: string; employeeId: string; batchId: string }) {
  const batch = await db.importBatch.findFirst({
    where: importBatchWhere(input.businessId, input.batchId),
    include: { rows: true },
  });
  if (!batch) throw new Error("Import batch not found");
  if (batch.status !== "IMPORTED" && batch.status !== "FAILED") throw new Error("Invalid import: only an imported batch can be rolled back");
  const targets = rollbackTargets(batch.rows.map((row) => ({
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    previous: (row.previous as Record<string, unknown> | null) ?? null,
  })));
  await db.$transaction(async (tx) => {
    for (const row of targets.created.filter((item) => item.entityType === "EXPENSE")) {
      await tx.expense.updateMany({ where: { id: row.entityId, businessId: input.businessId }, data: { deletedAt: new Date() } });
    }
    for (const row of targets.created.filter((item) => item.entityType === "CUSTOMER")) {
      await tx.customer.updateMany({ where: { id: row.entityId, businessId: input.businessId }, data: { deletedAt: new Date() } });
    }
    for (const row of targets.created.filter((item) => item.entityType === "PRODUCT")) {
      await tx.product.updateMany({
        where: { id: row.entityId, businessId: input.businessId },
        data: { deletedAt: new Date(), sku: null, barcode: null },
      });
    }
    for (const row of targets.created.filter((item) => item.entityType === "VENDOR")) {
      await tx.expenseVendor.updateMany({
        where: { id: row.entityId, businessId: input.businessId },
        data: { deletedAt: new Date(), normalizedName: `rolled-back-${row.entityId}` },
      });
    }
    for (const row of targets.updated) {
      if (row.entityType === "CUSTOMER") {
        await tx.customer.updateMany({ where: { id: row.entityId, businessId: input.businessId }, data: row.previous as Prisma.CustomerUpdateInput });
      }
      if (row.entityType === "VENDOR") {
        await tx.expenseVendor.updateMany({ where: { id: row.entityId, businessId: input.businessId }, data: row.previous as Prisma.ExpenseVendorUpdateInput });
      }
      if (row.entityType === "PRODUCT") {
        await tx.product.updateMany({ where: { id: row.entityId, businessId: input.businessId }, data: row.previous as Prisma.ProductUpdateInput });
      }
    }
    await tx.importExternalId.deleteMany({ where: { businessId: input.businessId, batchId: batch.id } });
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
  });
  await createAuditLog({
    businessId: input.businessId,
    employeeId: input.employeeId,
    action: "SETTINGS_CHANGE",
    entity: "ImportBatch",
    entityId: batch.id,
    details: { kind: "IMPORT_ROLLED_BACK", batchId: batch.id, entityType: batch.entityType },
  });
  return { id: batch.id, status: "ROLLED_BACK" as const };
}

export async function getImportBatch(businessId: string, batchId: string) {
  const batch = await db.importBatch.findFirst({
    where: importBatchWhere(businessId, batchId),
    include: { rows: { orderBy: { rowNumber: "asc" }, take: 50 } },
  });
  if (!batch) return null;
  return {
    id: batch.id,
    fileName: batch.fileName,
    sourceFormat: batch.sourceFormat,
    source: batch.source,
    entityType: batch.entityType,
    status: batch.status,
    headers: batch.headers,
    mapping: batch.mapping,
    rowCount: batch.rowCount,
    importedCount: batch.importedCount,
    updatedCount: batch.updatedCount,
    skippedCount: batch.skippedCount,
    failedCount: batch.failedCount,
    createdAt: batch.createdAt.toISOString(),
    sample: batch.rows.map((row) => ({
      rowNumber: row.rowNumber,
      action: row.action,
      message: row.message,
      externalId: row.externalId,
    })),
  };
}
