-- CreateEnum
CREATE TYPE "TimeEntryEditStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_EDIT_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'TIME_ENTRY_EDIT_REVIEW';

-- CreateTable
CREATE TABLE "TimeEntryEditRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "originalClockIn" TIMESTAMP(3) NOT NULL,
    "originalClockOut" TIMESTAMP(3),
    "proposedClockIn" TIMESTAMP(3) NOT NULL,
    "proposedClockOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "TimeEntryEditStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "denialReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntryEditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeEntryEditRequest_businessId_idx" ON "TimeEntryEditRequest"("businessId");

-- CreateIndex
CREATE INDEX "TimeEntryEditRequest_businessId_status_idx" ON "TimeEntryEditRequest"("businessId", "status");

-- CreateIndex
CREATE INDEX "TimeEntryEditRequest_timeEntryId_idx" ON "TimeEntryEditRequest"("timeEntryId");

-- CreateIndex
CREATE INDEX "TimeEntryEditRequest_employeeId_idx" ON "TimeEntryEditRequest"("employeeId");

-- CreateIndex
CREATE INDEX "TimeEntryEditRequest_status_idx" ON "TimeEntryEditRequest"("status");

-- AddForeignKey
ALTER TABLE "TimeEntryEditRequest" ADD CONSTRAINT "TimeEntryEditRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryEditRequest" ADD CONSTRAINT "TimeEntryEditRequest_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryEditRequest" ADD CONSTRAINT "TimeEntryEditRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryEditRequest" ADD CONSTRAINT "TimeEntryEditRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
