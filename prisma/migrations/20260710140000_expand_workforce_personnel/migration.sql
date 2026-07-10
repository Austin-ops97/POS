-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'SEASONAL', 'TEMPORARY', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('HOURLY', 'SALARY');

-- CreateEnum
CREATE TYPE "DisplayNameStrategy" AS ENUM ('LEGAL', 'PREFERRED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PtoAccrualPolicy" AS ENUM ('ANNUAL_GRANT', 'NONE');

-- CreateEnum
CREATE TYPE "PtoLedgerType" AS ENUM ('ACCRUAL', 'USAGE', 'ADJUSTMENT', 'CARRYOVER', 'REVERSAL');

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN     "sickBalanceHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ptoCarryoverLimit" DECIMAL(8,2),
ADD COLUMN     "ptoAccrualPolicy" "PtoAccrualPolicy" NOT NULL DEFAULT 'ANNUAL_GRANT',
ADD COLUMN     "legalFirstName" TEXT,
ADD COLUMN     "legalMiddleName" TEXT,
ADD COLUMN     "legalLastName" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "displayNameStrategy" "DisplayNameStrategy" NOT NULL DEFAULT 'LEGAL',
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "workEmail" TEXT,
ADD COLUMN     "mobilePhone" TEXT,
ADD COLUMN     "secondaryPhone" TEXT,
ADD COLUMN     "profilePhotoUrl" TEXT,
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "stateProvince" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'US',
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "employmentType" "EmploymentType",
ADD COLUMN     "hireDate" DATE,
ADD COLUMN     "startDate" DATE,
ADD COLUMN     "terminationDate" DATE,
ADD COLUMN     "terminationReason" TEXT,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "defaultLocationId" TEXT,
ADD COLUMN     "employmentNotes" TEXT;

-- Backfill structured name fields from legacy name column
UPDATE "EmployeeProfile"
SET
  "legalFirstName" = COALESCE(NULLIF(split_part(trim("name"), ' ', 1), ''), trim("name")),
  "legalLastName" = CASE
    WHEN position(' ' in trim("name")) > 0 THEN trim(substring(trim("name") from position(' ' in trim("name")) + 1))
    ELSE NULL
  END,
  "workEmail" = "email",
  "mobilePhone" = "phone"
WHERE "legalFirstName" IS NULL;

-- CreateTable
CREATE TABLE "EmployeeEmergencyContact" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "primaryPhone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeEmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payType" "PayType" NOT NULL,
    "hourlyRate" DECIMAL(10,2),
    "annualSalary" DECIMAL(12,2),
    "overtimeEligible" BOOLEAN NOT NULL DEFAULT true,
    "overtimeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtoLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "PtoLedgerType" NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "balanceAfter" DECIMAL(8,2) NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "adjustedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PtoLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- Backfill compensation history from hourlyWage
INSERT INTO "EmployeeCompensation" (
    "id",
    "employeeId",
    "payType",
    "hourlyRate",
    "overtimeEligible",
    "overtimeMultiplier",
    "effectiveFrom",
    "createdAt"
)
SELECT
    "id" || '-initial-comp',
    "id",
    'HOURLY',
    "hourlyWage",
    true,
    1.5,
    COALESCE("hireDate", "createdAt"::date, CURRENT_DATE),
    "createdAt"
FROM "EmployeeProfile"
WHERE "hourlyWage" IS NOT NULL;

-- CreateIndex
CREATE INDEX "EmployeeProfile_businessId_status_idx" ON "EmployeeProfile"("businessId", "status");

-- CreateIndex
CREATE INDEX "EmployeeProfile_managerId_idx" ON "EmployeeProfile"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_businessId_employeeNumber_key" ON "EmployeeProfile"("businessId", "employeeNumber");

-- CreateIndex
CREATE INDEX "EmployeeEmergencyContact_employeeId_idx" ON "EmployeeEmergencyContact"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_employeeId_idx" ON "EmployeeCompensation"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_employeeId_effectiveFrom_idx" ON "EmployeeCompensation"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PtoLedgerEntry_businessId_idx" ON "PtoLedgerEntry"("businessId");

-- CreateIndex
CREATE INDEX "PtoLedgerEntry_employeeId_idx" ON "PtoLedgerEntry"("employeeId");

-- CreateIndex
CREATE INDEX "PtoLedgerEntry_createdAt_idx" ON "PtoLedgerEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmergencyContact" ADD CONSTRAINT "EmployeeEmergencyContact_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtoLedgerEntry" ADD CONSTRAINT "PtoLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtoLedgerEntry" ADD CONSTRAINT "PtoLedgerEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtoLedgerEntry" ADD CONSTRAINT "PtoLedgerEntry_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
