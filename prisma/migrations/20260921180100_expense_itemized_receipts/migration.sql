-- CreateEnum
CREATE TYPE "ExpenseEntryMode" AS ENUM ('SIMPLE', 'ITEMIZED');

-- CreateEnum
CREATE TYPE "ExpenseReceiptRole" AS ENUM ('ORIGINAL', 'PROCESSED');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "entryMode" "ExpenseEntryMode" NOT NULL DEFAULT 'SIMPLE';
ALTER TABLE "Expense" ADD COLUMN "receiptNumber" TEXT;
ALTER TABLE "Expense" ADD COLUMN "merchantAddress" TEXT;
ALTER TABLE "Expense" ADD COLUMN "businessPurpose" TEXT;
ALTER TABLE "Expense" ADD COLUMN "paymentLast4" TEXT;
ALTER TABLE "Expense" ADD COLUMN "purchaseTime" TEXT;

-- AlterTable
ALTER TABLE "ExpenseLineItem" ADD COLUMN "categoryId" TEXT;

-- AlterTable
ALTER TABLE "ExpenseReceipt" ADD COLUMN "role" "ExpenseReceiptRole" NOT NULL DEFAULT 'ORIGINAL';

-- CreateIndex
CREATE INDEX "Expense_businessId_receiptNumber_idx" ON "Expense"("businessId", "receiptNumber");

-- CreateIndex
CREATE INDEX "ExpenseLineItem_categoryId_idx" ON "ExpenseLineItem"("categoryId");

-- AddForeignKey
ALTER TABLE "ExpenseLineItem" ADD CONSTRAINT "ExpenseLineItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
