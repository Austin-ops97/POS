ALTER TYPE "TimeOffType" ADD VALUE IF NOT EXISTS 'VACATION';
ALTER TYPE "TimeOffType" ADD VALUE IF NOT EXISTS 'HOLIDAY';

ALTER TABLE "WorkforceSettings"
  ADD COLUMN "paidBreaks" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SickLedgerEntry" (
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
  CONSTRAINT "SickLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SickLedgerEntry_businessId_idx" ON "SickLedgerEntry"("businessId");
CREATE INDEX "SickLedgerEntry_employeeId_idx" ON "SickLedgerEntry"("employeeId");
CREATE INDEX "SickLedgerEntry_createdAt_idx" ON "SickLedgerEntry"("createdAt");
ALTER TABLE "SickLedgerEntry" ADD CONSTRAINT "SickLedgerEntry_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SickLedgerEntry" ADD CONSTRAINT "SickLedgerEntry_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SickLedgerEntry" ADD CONSTRAINT "SickLedgerEntry_adjustedById_fkey"
  FOREIGN KEY ("adjustedById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
