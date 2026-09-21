-- AlterTable
ALTER TABLE "WorkforceSettings" ADD COLUMN "employerReference" TEXT;

-- CreateEnum
CREATE TYPE "PayrollTaxSide" AS ENUM ('EMPLOYEE', 'EMPLOYER');
CREATE TYPE "PayrollAmountBasis" AS ENUM ('PERCENT_OF_GROSS', 'PERCENT_OF_TAXABLE', 'FLAT');
CREATE TYPE "PayrollDeductionTiming" AS ENUM ('PRE_TAX', 'POST_TAX');
CREATE TYPE "PayrollRunStatus" AS ENUM ('PROCESSED', 'VOID');
CREATE TYPE "PayStubLineKind" AS ENUM ('EARNING', 'TAX', 'DEDUCTION', 'EMPLOYER_TAX');

-- CreateTable
CREATE TABLE "PayrollTaxConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "side" "PayrollTaxSide" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basis" "PayrollAmountBasis" NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "wageBase" DECIMAL(12,2),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollTaxConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollDeductionConfig" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timing" "PayrollDeductionTiming" NOT NULL,
    "basis" "PayrollAmountBasis" NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollDeductionConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'PROCESSED',
    "employerName" TEXT NOT NULL,
    "employerAddress" TEXT,
    "employerReference" TEXT,
    "processedById" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayStub" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeNumber" TEXT,
    "employeeAddress" TEXT,
    "payType" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "preTaxDeductions" DECIMAL(12,2) NOT NULL,
    "taxableWages" DECIMAL(12,2) NOT NULL,
    "employeeTaxes" DECIMAL(12,2) NOT NULL,
    "postTaxDeductions" DECIMAL(12,2) NOT NULL,
    "net" DECIMAL(12,2) NOT NULL,
    "employerTaxes" DECIMAL(12,2) NOT NULL,
    "ytdGross" DECIMAL(12,2) NOT NULL,
    "ytdDeductions" DECIMAL(12,2) NOT NULL,
    "ytdEmployeeTaxes" DECIMAL(12,2) NOT NULL,
    "ytdNet" DECIMAL(12,2) NOT NULL,
    "ytdEmployerTaxes" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayStub_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayStubLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "payStubId" TEXT NOT NULL,
    "kind" "PayStubLineKind" NOT NULL,
    "side" "PayrollTaxSide" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "hours" DECIMAL(8,2),
    "rate" DECIMAL(12,6),
    "amount" DECIMAL(12,2) NOT NULL,
    "subjectWages" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ytdAmount" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PayStubLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollTaxConfig_businessId_effectiveFrom_idx" ON "PayrollTaxConfig"("businessId", "effectiveFrom");
CREATE INDEX "PayrollTaxConfig_businessId_side_code_idx" ON "PayrollTaxConfig"("businessId", "side", "code");
CREATE INDEX "PayrollDeductionConfig_businessId_effectiveFrom_idx" ON "PayrollDeductionConfig"("businessId", "effectiveFrom");
CREATE INDEX "PayrollDeductionConfig_businessId_code_idx" ON "PayrollDeductionConfig"("businessId", "code");
CREATE INDEX "PayrollRun_businessId_periodStart_idx" ON "PayrollRun"("businessId", "periodStart");
CREATE INDEX "PayrollRun_businessId_payDate_idx" ON "PayrollRun"("businessId", "payDate");
CREATE INDEX "PayrollRun_businessId_status_idx" ON "PayrollRun"("businessId", "status");
CREATE UNIQUE INDEX "PayrollRun_one_processed_period" ON "PayrollRun"("businessId", "periodStart", "periodEnd") WHERE "status" = 'PROCESSED';
CREATE UNIQUE INDEX "PayStub_payrollRunId_employeeId_key" ON "PayStub"("payrollRunId", "employeeId");
CREATE INDEX "PayStub_businessId_idx" ON "PayStub"("businessId");
CREATE INDEX "PayStub_businessId_payDate_idx" ON "PayStub"("businessId", "payDate");
CREATE INDEX "PayStub_employeeId_payDate_idx" ON "PayStub"("employeeId", "payDate");
CREATE INDEX "PayStubLine_businessId_idx" ON "PayStubLine"("businessId");
CREATE INDEX "PayStubLine_payStubId_idx" ON "PayStubLine"("payStubId");
CREATE INDEX "PayStubLine_businessId_code_side_idx" ON "PayStubLine"("businessId", "code", "side");

ALTER TABLE "PayrollTaxConfig" ADD CONSTRAINT "PayrollTaxConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollDeductionConfig" ADD CONSTRAINT "PayrollDeductionConfig_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayStub" ADD CONSTRAINT "PayStub_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayStub" ADD CONSTRAINT "PayStub_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayStub" ADD CONSTRAINT "PayStub_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayStubLine" ADD CONSTRAINT "PayStubLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayStubLine" ADD CONSTRAINT "PayStubLine_payStubId_fkey" FOREIGN KEY ("payStubId") REFERENCES "PayStub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
