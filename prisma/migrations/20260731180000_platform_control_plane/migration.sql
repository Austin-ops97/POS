CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "User" ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "Business" ADD COLUMN "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "EmployeeProfile"
  ADD COLUMN "inviteTokenHash" TEXT,
  ADD COLUMN "inviteExpiresAt" TIMESTAMP(3),
  ADD COLUMN "invitedAt" TIMESTAMP(3),
  ADD COLUMN "joinedAt" TIMESTAMP(3);
ALTER TABLE "ExpenseReceipt" ADD COLUMN "data" BYTEA;
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

CREATE TABLE "EmployeeModuleAccess" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeModuleAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeProfile_inviteTokenHash_key" ON "EmployeeProfile"("inviteTokenHash");
CREATE UNIQUE INDEX "EmployeeModuleAccess_employeeId_module_key" ON "EmployeeModuleAccess"("employeeId", "module");
CREATE INDEX "EmployeeModuleAccess_employeeId_idx" ON "EmployeeModuleAccess"("employeeId");
ALTER TABLE "EmployeeModuleAccess" ADD CONSTRAINT "EmployeeModuleAccess_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
