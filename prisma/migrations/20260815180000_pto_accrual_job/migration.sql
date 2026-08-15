ALTER TYPE "PtoAccrualPolicy" ADD VALUE IF NOT EXISTS 'PER_PAY_PERIOD';
ALTER TYPE "PtoAccrualPolicy" ADD VALUE IF NOT EXISTS 'MONTHLY';

ALTER TABLE "WorkforceSettings"
  ADD COLUMN "defaultPtoAccrualPolicy" "PtoAccrualPolicy" NOT NULL DEFAULT 'ANNUAL_GRANT';

CREATE INDEX "PtoLedgerEntry_employeeId_type_referenceId_idx"
  ON "PtoLedgerEntry"("employeeId", "type", "referenceId");

CREATE UNIQUE INDEX "PtoLedgerEntry_accrual_period_unique"
  ON "PtoLedgerEntry"("employeeId", "referenceId")
  WHERE "type" = 'ACCRUAL' AND "referenceId" IS NOT NULL;

CREATE UNIQUE INDEX "PtoLedgerEntry_carryover_period_unique"
  ON "PtoLedgerEntry"("employeeId", "referenceId")
  WHERE "type" = 'CARRYOVER' AND "referenceId" IS NOT NULL;
