import { z } from "zod";

const money = z.number().min(0).max(1_000_000_000);
const optionalId = z.string().min(1).optional().nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const expenseStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "NEEDS_MORE_INFO",
  "REIMBURSED",
  "PAID",
  "ARCHIVED",
]);

export const expensePaymentMethodSchema = z.enum([
  "COMPANY_CARD",
  "PERSONAL_CARD",
  "CASH",
  "BANK_TRANSFER",
  "OTHER",
]);

export const expenseCreateSchema = z.object({
  merchant: z.string().min(1, "Merchant is required").max(200),
  amount: money,
  tax: money.optional(),
  tip: money.optional(),
  total: money.optional(),
  purchaseDate: dateOnly,
  companyCardId: optionalId,
  employeeId: z.string().min(1).optional(),
  locationId: optionalId,
  department: z.string().max(120).optional().nullable(),
  categoryId: optionalId,
  project: z.string().max(120).optional().nullable(),
  jobNumber: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  paymentMethod: expensePaymentMethodSchema.optional(),
  mileageMiles: z.number().min(0).max(100000).optional().nullable(),
  mileageRate: z.number().min(0).max(100).optional().nullable(),
  currency: z.string().length(3).optional(),
  status: expenseStatusSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  missingReceipt: z.boolean().optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().min(0).optional(),
        unitPrice: z.number().min(0).optional().nullable(),
        amount: money,
      })
    )
    .max(100)
    .optional(),
  submit: z.boolean().optional(),
});

export const expenseUpdateSchema = expenseCreateSchema.partial().extend({
  id: z.string().min(1).optional(),
});

export const expenseListQuerySchema = z.object({
  merchant: z.string().optional(),
  employeeId: z.string().optional(),
  categoryId: z.string().optional(),
  companyCardId: z.string().optional(),
  status: expenseStatusSchema.optional(),
  vendorId: z.string().optional(),
  department: z.string().optional(),
  locationId: z.string().optional(),
  project: z.string().optional(),
  jobNumber: z.string().optional(),
  tag: z.string().optional(),
  receiptExists: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  missingReceipt: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  flagged: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const expenseApprovalSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES", "FLAG", "REIMBURSE", "MARK_PAID"]),
  note: z.string().max(2000).optional(),
  flagMessage: z.string().max(500).optional(),
});

export const expenseCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const expenseReceiptSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(15_000_000),
  storageUrl: z.string().min(1),
  pageNumber: z.number().int().min(1).max(50).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  contentHash: z.string().max(128).optional(),
  ocrText: z.string().max(50_000).optional(),
  enhanced: z.boolean().optional(),
  kind: z.enum(["IMAGE", "PDF"]).optional(),
});

export const ocrParseSchema = z.object({
  text: z.string().max(50_000).optional(),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(120).optional(),
  storageUrl: z.string().optional(),
});

export const companyCardSchema = z.object({
  name: z.string().min(1).max(120),
  lastFour: z.string().regex(/^\d{4}$/, "Enter the last 4 digits only"),
  bank: z.string().max(120).optional().nullable(),
  cardType: z.enum(["CREDIT", "DEBIT", "VIRTUAL", "CHARGE"]).optional(),
  assignedEmployeeId: optionalId,
  monthlyLimit: money.optional().nullable(),
  dailyLimit: money.optional().nullable(),
  allowedCategoryIds: z.array(z.string().min(1)).max(50).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const expenseCategorySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const expenseBudgetSchema = z.object({
  categoryId: z.string().min(1),
  period: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL"]),
  amount: money,
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12).optional().nullable(),
  quarter: z.number().int().min(1).max(4).optional().nullable(),
  alert75: z.boolean().optional(),
  alert90: z.boolean().optional(),
  alert100: z.boolean().optional(),
});

export const cardTransactionSchema = z.object({
  companyCardId: optionalId,
  employeeId: optionalId,
  source: z
    .enum(["MANUAL", "STRIPE", "AMEX", "CHASE", "CAPITAL_ONE", "BREX", "RAMP", "PLAID", "OTHER"])
    .optional(),
  externalId: z.string().max(200).optional().nullable(),
  merchantName: z.string().min(1).max(200),
  amount: money,
  currency: z.string().length(3).optional(),
  purchasedAt: z.string().datetime().or(dateOnly),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});

export const expenseVendorSchema = z.object({
  name: z.string().min(1).max(200),
  categoryId: optionalId,
  address: z.string().max(500).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  website: z.string().url().optional().or(z.literal("")).nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isFavorite: z.boolean().optional(),
});

export const expenseSettingsSchema = z.object({
  largePurchaseThreshold: money.optional(),
  requireReceiptAbove: money.optional(),
  afterHoursStart: z.number().int().min(0).max(23).optional(),
  afterHoursEnd: z.number().int().min(0).max(23).optional(),
  weekendFlagsEnabled: z.boolean().optional(),
  autoSubmitOnCreate: z.boolean().optional(),
  defaultCurrency: z.string().length(3).optional(),
});

export const savedFilterSchema = z.object({
  name: z.string().min(1).max(80),
  filters: z.record(z.string(), z.unknown()),
});

export const reportQuerySchema = z.object({
  groupBy: z
    .enum([
      "employee",
      "location",
      "department",
      "vendor",
      "category",
      "card",
      "date",
      "project",
      "job",
      "status",
      "approval",
    ])
    .default("category"),
  dateFrom: dateOnly.optional(),
  dateTo: dateOnly.optional(),
  format: z.enum(["json", "csv", "excel", "pdf"]).optional().default("json"),
  employeeId: z.string().optional(),
  locationId: z.string().optional(),
  department: z.string().optional(),
  categoryId: z.string().optional(),
  companyCardId: z.string().optional(),
  status: expenseStatusSchema.optional(),
  project: z.string().optional(),
  jobNumber: z.string().optional(),
});
