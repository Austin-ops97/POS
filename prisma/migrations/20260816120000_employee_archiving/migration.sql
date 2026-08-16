ALTER TABLE "EmployeeProfile" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "EmployeeProfile_businessId_archivedAt_idx" ON "EmployeeProfile"("businessId", "archivedAt");
