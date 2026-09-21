-- CreateEnum
CREATE TYPE "BankConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');
CREATE TYPE "BankAccountKind" AS ENUM ('CHECKING', 'SAVINGS', 'CREDIT', 'OTHER');
CREATE TYPE "BankTxnSource" AS ENUM ('PLAID', 'STATEMENT');
CREATE TYPE "BankReconciliationStatus" AS ENUM ('UNREVIEWED', 'CATEGORIZED', 'MATCHED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PLAID',
    "status" "BankConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "institutionId" TEXT,
    "institutionName" TEXT,
    "itemId" TEXT,
    "accessTokenCipher" TEXT,
    "syncCursor" TEXT,
    "environment" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "connectionId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "officialName" TEXT,
    "mask" TEXT,
    "kind" "BankAccountKind" NOT NULL DEFAULT 'CHECKING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currentBalance" DECIMAL(14,2),
    "availableBalance" DECIMAL(14,2),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" "BankTxnSource" NOT NULL,
    "externalId" TEXT,
    "statementId" TEXT,
    "postedOn" DATE NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "rawMerchant" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "rawBalance" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "categoryId" TEXT,
    "suggestedCategoryId" TEXT,
    "suggestionReason" TEXT,
    "projectId" TEXT,
    "vendorId" TEXT,
    "customerId" TEXT,
    "notes" TEXT,
    "personal" BOOLEAN NOT NULL DEFAULT false,
    "reconciliation" "BankReconciliationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "matchedExpenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankTransactionSplit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "projectId" TEXT,
    "vendorId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BankTransactionSplit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseCategoryRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseCategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaxCategoryMapping" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "taxLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaxCategoryMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordAssociation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "receiptId" TEXT,
    "documentId" TEXT,
    "expenseId" TEXT,
    "bankTransactionId" TEXT,
    "projectId" TEXT,
    "vendorId" TEXT,
    "employeeId" TEXT,
    "customerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordAssociation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankConnection_businessId_key" ON "BankConnection"("businessId");
CREATE INDEX "BankConnection_businessId_status_idx" ON "BankConnection"("businessId", "status");
CREATE UNIQUE INDEX "BankAccount_businessId_externalId_key" ON "BankAccount"("businessId", "externalId");
CREATE INDEX "BankAccount_businessId_idx" ON "BankAccount"("businessId");
CREATE INDEX "BankAccount_connectionId_idx" ON "BankAccount"("connectionId");
CREATE UNIQUE INDEX "BankTransaction_businessId_source_externalId_key" ON "BankTransaction"("businessId", "source", "externalId");
CREATE INDEX "BankTransaction_businessId_postedOn_idx" ON "BankTransaction"("businessId", "postedOn");
CREATE INDEX "BankTransaction_accountId_idx" ON "BankTransaction"("accountId");
CREATE INDEX "BankTransaction_categoryId_idx" ON "BankTransaction"("categoryId");
CREATE INDEX "BankTransaction_statementId_idx" ON "BankTransaction"("statementId");
CREATE INDEX "BankTransactionSplit_businessId_transactionId_idx" ON "BankTransactionSplit"("businessId", "transactionId");
CREATE UNIQUE INDEX "ExpenseCategoryRule_businessId_pattern_key" ON "ExpenseCategoryRule"("businessId", "pattern");
CREATE INDEX "ExpenseCategoryRule_businessId_idx" ON "ExpenseCategoryRule"("businessId");
CREATE UNIQUE INDEX "TaxCategoryMapping_categoryId_key" ON "TaxCategoryMapping"("categoryId");
CREATE INDEX "TaxCategoryMapping_businessId_idx" ON "TaxCategoryMapping"("businessId");
CREATE INDEX "RecordAssociation_businessId_bankTransactionId_idx" ON "RecordAssociation"("businessId", "bankTransactionId");
CREATE INDEX "RecordAssociation_businessId_expenseId_idx" ON "RecordAssociation"("businessId", "expenseId");
CREATE INDEX "RecordAssociation_receiptId_idx" ON "RecordAssociation"("receiptId");
CREATE INDEX "RecordAssociation_documentId_idx" ON "RecordAssociation"("documentId");

ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OfficeWorkspaceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ExpenseVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matchedExpenseId_fkey" FOREIGN KEY ("matchedExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransactionSplit" ADD CONSTRAINT "BankTransactionSplit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransactionSplit" ADD CONSTRAINT "BankTransactionSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransactionSplit" ADD CONSTRAINT "BankTransactionSplit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategoryRule" ADD CONSTRAINT "ExpenseCategoryRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategoryRule" ADD CONSTRAINT "ExpenseCategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategoryRule" ADD CONSTRAINT "ExpenseCategoryRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxCategoryMapping" ADD CONSTRAINT "TaxCategoryMapping_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxCategoryMapping" ADD CONSTRAINT "TaxCategoryMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ExpenseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OfficeWorkspaceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ExpenseVendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAssociation" ADD CONSTRAINT "RecordAssociation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
