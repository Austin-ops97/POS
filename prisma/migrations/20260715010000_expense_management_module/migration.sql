-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFO', 'REIMBURSED', 'PAID', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('COMPANY_CARD', 'PERSONAL_CARD', 'CASH', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "CompanyCardType" AS ENUM ('CREDIT', 'DEBIT', 'VIRTUAL', 'CHARGE');

-- CreateEnum
CREATE TYPE "CompanyCardStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExpenseFlagType" AS ENUM ('DUPLICATE', 'LARGE_PURCHASE', 'WEEKEND', 'AFTER_HOURS', 'WRONG_CATEGORY', 'SPLIT_TRANSACTION', 'REPEATED_IDENTICAL', 'OUT_OF_POLICY', 'MISSING_RECEIPT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ExpenseFlagSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH');

-- CreateEnum
CREATE TYPE "ExpenseNotificationType" AS ENUM ('EXPENSE_APPROVED', 'EXPENSE_REJECTED', 'RECEIPT_MISSING', 'MANAGER_COMMENTED', 'BUDGET_EXCEEDED', 'PENDING_APPROVAL', 'LARGE_PURCHASE', 'SUSPICIOUS_PURCHASE', 'REQUEST_CHANGES', 'REIMBURSEMENT_PAID');

-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "CardTransactionSource" AS ENUM ('MANUAL', 'STRIPE', 'AMEX', 'CHASE', 'CAPITAL_ONE', 'BREX', 'RAMP', 'PLAID', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseReceiptKind" AS ENUM ('IMAGE', 'PDF');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_SUBMIT';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_REJECT';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_REIMBURSE';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_FLAG';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_COMMENT';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_CARD_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_BUDGET_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE 'EXPENSE_CATEGORY_CHANGE';

-- CreateTable
CREATE TABLE "ExpenseSettings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "largePurchaseThreshold" DECIMAL(12,2) NOT NULL DEFAULT 500,
    "requireReceiptAbove" DECIMAL(12,2) NOT NULL DEFAULT 25,
    "afterHoursStart" INTEGER NOT NULL DEFAULT 20,
    "afterHoursEnd" INTEGER NOT NULL DEFAULT 6,
    "weekendFlagsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSubmitOnCreate" BOOLEAN NOT NULL DEFAULT false,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseVendor" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "categoryId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "averageSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCard" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "bank" TEXT,
    "cardType" "CompanyCardType" NOT NULL DEFAULT 'CREDIT',
    "assignedEmployeeId" TEXT,
    "monthlyLimit" DECIMAL(12,2),
    "dailyLimit" DECIMAL(12,2),
    "status" "CompanyCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "syncProvider" TEXT,
    "syncExternalId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCardAllowedCategory" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CompanyCardAllowedCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCardTransaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "companyCardId" TEXT,
    "employeeId" TEXT,
    "source" "CardTransactionSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "merchantName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "matchedExpenseId" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyCardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "submittedById" TEXT,
    "categoryId" TEXT,
    "vendorId" TEXT,
    "companyCardId" TEXT,
    "locationId" TEXT,
    "department" TEXT,
    "project" TEXT,
    "jobNumber" TEXT,
    "merchant" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "purchaseDate" DATE NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'COMPANY_CARD',
    "mileageMiles" DECIMAL(10,2),
    "mileageRate" DECIMAL(8,4),
    "notes" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "missingReceipt" BOOLEAN NOT NULL DEFAULT false,
    "receiptReminderAt" TIMESTAMP(3),
    "reimbursedAt" TIMESTAMP(3),
    "reimbursedAmount" DECIMAL(12,2),
    "paidAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "ocrRawText" TEXT,
    "ocrConfidence" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReceipt" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "kind" "ExpenseReceiptKind" NOT NULL DEFAULT 'IMAGE',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL DEFAULT 1,
    "width" INTEGER,
    "height" INTEGER,
    "contentHash" TEXT,
    "ocrText" TEXT,
    "enhanced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseLineItem" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseTag" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseTagAssignment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ExpenseTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseComment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseApprovalEvent" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "ExpenseStatus",
    "toStatus" "ExpenseStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseFlag" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "type" "ExpenseFlagType" NOT NULL,
    "severity" "ExpenseFlagSeverity" NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "raisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "period" "BudgetPeriod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "quarter" INTEGER,
    "alert75" BOOLEAN NOT NULL DEFAULT true,
    "alert90" BOOLEAN NOT NULL DEFAULT true,
    "alert100" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseNotification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "ExpenseNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "expenseId" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAuditEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT,
    "expenseId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseSavedFilter" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseSavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseSettings_businessId_key" ON "ExpenseSettings"("businessId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_businessId_idx" ON "ExpenseCategory"("businessId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_businessId_isActive_idx" ON "ExpenseCategory"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_businessId_slug_key" ON "ExpenseCategory"("businessId", "slug");

-- CreateIndex
CREATE INDEX "ExpenseVendor_businessId_idx" ON "ExpenseVendor"("businessId");

-- CreateIndex
CREATE INDEX "ExpenseVendor_businessId_name_idx" ON "ExpenseVendor"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseVendor_businessId_normalizedName_key" ON "ExpenseVendor"("businessId", "normalizedName");

-- CreateIndex
CREATE INDEX "CompanyCard_businessId_idx" ON "CompanyCard"("businessId");

-- CreateIndex
CREATE INDEX "CompanyCard_businessId_lastFour_idx" ON "CompanyCard"("businessId", "lastFour");

-- CreateIndex
CREATE INDEX "CompanyCard_assignedEmployeeId_idx" ON "CompanyCard"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "CompanyCard_status_idx" ON "CompanyCard"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCardAllowedCategory_cardId_categoryId_key" ON "CompanyCardAllowedCategory"("cardId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCardTransaction_matchedExpenseId_key" ON "CompanyCardTransaction"("matchedExpenseId");

-- CreateIndex
CREATE INDEX "CompanyCardTransaction_businessId_idx" ON "CompanyCardTransaction"("businessId");

-- CreateIndex
CREATE INDEX "CompanyCardTransaction_companyCardId_idx" ON "CompanyCardTransaction"("companyCardId");

-- CreateIndex
CREATE INDEX "CompanyCardTransaction_purchasedAt_idx" ON "CompanyCardTransaction"("purchasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCardTransaction_businessId_source_externalId_key" ON "CompanyCardTransaction"("businessId", "source", "externalId");

-- CreateIndex
CREATE INDEX "Expense_businessId_idx" ON "Expense"("businessId");

-- CreateIndex
CREATE INDEX "Expense_businessId_status_idx" ON "Expense"("businessId", "status");

-- CreateIndex
CREATE INDEX "Expense_businessId_purchaseDate_idx" ON "Expense"("businessId", "purchaseDate");

-- CreateIndex
CREATE INDEX "Expense_employeeId_idx" ON "Expense"("employeeId");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_vendorId_idx" ON "Expense"("vendorId");

-- CreateIndex
CREATE INDEX "Expense_companyCardId_idx" ON "Expense"("companyCardId");

-- CreateIndex
CREATE INDEX "Expense_locationId_idx" ON "Expense"("locationId");

-- CreateIndex
CREATE INDEX "Expense_merchant_idx" ON "Expense"("merchant");

-- CreateIndex
CREATE INDEX "Expense_total_idx" ON "Expense"("total");

-- CreateIndex
CREATE INDEX "Expense_contentHash_idx" ON "Expense"("contentHash");

-- CreateIndex
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_expenseId_idx" ON "ExpenseReceipt"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_contentHash_idx" ON "ExpenseReceipt"("contentHash");

-- CreateIndex
CREATE INDEX "ExpenseLineItem_expenseId_idx" ON "ExpenseLineItem"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseTag_businessId_idx" ON "ExpenseTag"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseTag_businessId_name_key" ON "ExpenseTag"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseTagAssignment_expenseId_tagId_key" ON "ExpenseTagAssignment"("expenseId", "tagId");

-- CreateIndex
CREATE INDEX "ExpenseComment_expenseId_idx" ON "ExpenseComment"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseApprovalEvent_expenseId_idx" ON "ExpenseApprovalEvent"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseApprovalEvent_createdAt_idx" ON "ExpenseApprovalEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseFlag_expenseId_idx" ON "ExpenseFlag"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseFlag_type_idx" ON "ExpenseFlag"("type");

-- CreateIndex
CREATE INDEX "ExpenseBudget_businessId_idx" ON "ExpenseBudget"("businessId");

-- CreateIndex
CREATE INDEX "ExpenseBudget_categoryId_idx" ON "ExpenseBudget"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBudget_businessId_categoryId_period_year_month_quarter_key" ON "ExpenseBudget"("businessId", "categoryId", "period", "year", "month", "quarter");

-- CreateIndex
CREATE INDEX "ExpenseNotification_businessId_idx" ON "ExpenseNotification"("businessId");

-- CreateIndex
CREATE INDEX "ExpenseNotification_employeeId_readAt_idx" ON "ExpenseNotification"("employeeId", "readAt");

-- CreateIndex
CREATE INDEX "ExpenseNotification_createdAt_idx" ON "ExpenseNotification"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseAuditEvent_businessId_idx" ON "ExpenseAuditEvent"("businessId");

-- CreateIndex
CREATE INDEX "ExpenseAuditEvent_expenseId_idx" ON "ExpenseAuditEvent"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseAuditEvent_createdAt_idx" ON "ExpenseAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ExpenseAuditEvent_entity_idx" ON "ExpenseAuditEvent"("entity");

-- CreateIndex
CREATE INDEX "ExpenseSavedFilter_businessId_idx" ON "ExpenseSavedFilter"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseSavedFilter_employeeId_name_key" ON "ExpenseSavedFilter"("employeeId", "name");

-- AddForeignKey
ALTER TABLE "ExpenseSettings" ADD CONSTRAINT "ExpenseSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVendor" ADD CONSTRAINT "ExpenseVendor_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseVendor" ADD CONSTRAINT "ExpenseVendor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCard" ADD CONSTRAINT "CompanyCard_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCard" ADD CONSTRAINT "CompanyCard_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCard" ADD CONSTRAINT "CompanyCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCardAllowedCategory" ADD CONSTRAINT "CompanyCardAllowedCategory_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CompanyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCardAllowedCategory" ADD CONSTRAINT "CompanyCardAllowedCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCardTransaction" ADD CONSTRAINT "CompanyCardTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCardTransaction" ADD CONSTRAINT "CompanyCardTransaction_companyCardId_fkey" FOREIGN KEY ("companyCardId") REFERENCES "CompanyCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCardTransaction" ADD CONSTRAINT "CompanyCardTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCardTransaction" ADD CONSTRAINT "CompanyCardTransaction_matchedExpenseId_fkey" FOREIGN KEY ("matchedExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ExpenseVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyCardId_fkey" FOREIGN KEY ("companyCardId") REFERENCES "CompanyCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt" ADD CONSTRAINT "ExpenseReceipt_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLineItem" ADD CONSTRAINT "ExpenseLineItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTag" ADD CONSTRAINT "ExpenseTag_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTagAssignment" ADD CONSTRAINT "ExpenseTagAssignment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseTagAssignment" ADD CONSTRAINT "ExpenseTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ExpenseTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseComment" ADD CONSTRAINT "ExpenseComment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseComment" ADD CONSTRAINT "ExpenseComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApprovalEvent" ADD CONSTRAINT "ExpenseApprovalEvent_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApprovalEvent" ADD CONSTRAINT "ExpenseApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseFlag" ADD CONSTRAINT "ExpenseFlag_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseFlag" ADD CONSTRAINT "ExpenseFlag_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseBudget" ADD CONSTRAINT "ExpenseBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseNotification" ADD CONSTRAINT "ExpenseNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseNotification" ADD CONSTRAINT "ExpenseNotification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAuditEvent" ADD CONSTRAINT "ExpenseAuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAuditEvent" ADD CONSTRAINT "ExpenseAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSavedFilter" ADD CONSTRAINT "ExpenseSavedFilter_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSavedFilter" ADD CONSTRAINT "ExpenseSavedFilter_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
