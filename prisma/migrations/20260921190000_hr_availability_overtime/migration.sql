-- AlterTable
ALTER TABLE "WorkforceSettings" ADD COLUMN "overtimeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.5;
ALTER TABLE "WorkforceSettings" ADD COLUMN "dailyOvertimeThresholdHours" DECIMAL(6,2);
ALTER TABLE "WorkforceSettings" ADD COLUMN "doubleTimeDailyThresholdHours" DECIMAL(6,2);
ALTER TABLE "WorkforceSettings" ADD COLUMN "doubleTimeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2;
ALTER TABLE "WorkforceSettings" ADD COLUMN "laborCostAlertAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN "maxWeeklyHours" DECIMAL(6,2);
ALTER TABLE "EmployeeProfile" ADD COLUMN "preferredWeeklyHours" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "EmployeeAvailabilityWindow" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAvailabilityException" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeCalculation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "regularHours" DECIMAL(8,2) NOT NULL,
    "overtimeHours" DECIMAL(8,2) NOT NULL,
    "doubleTimeHours" DECIMAL(8,2) NOT NULL,
    "totalHours" DECIMAL(8,2) NOT NULL,
    "regularPay" DECIMAL(12,2) NOT NULL,
    "overtimePay" DECIMAL(12,2) NOT NULL,
    "doubleTimePay" DECIMAL(12,2) NOT NULL,
    "grossPay" DECIMAL(12,2) NOT NULL,
    "rules" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OvertimeCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeAvailabilityWindow_businessId_idx" ON "EmployeeAvailabilityWindow"("businessId");
CREATE INDEX "EmployeeAvailabilityWindow_employeeId_weekday_idx" ON "EmployeeAvailabilityWindow"("employeeId", "weekday");
CREATE INDEX "EmployeeAvailabilityException_businessId_idx" ON "EmployeeAvailabilityException"("businessId");
CREATE INDEX "EmployeeAvailabilityException_employeeId_date_idx" ON "EmployeeAvailabilityException"("employeeId", "date");
CREATE UNIQUE INDEX "OvertimeCalculation_employeeId_periodStart_periodEnd_key" ON "OvertimeCalculation"("employeeId", "periodStart", "periodEnd");
CREATE INDEX "OvertimeCalculation_businessId_periodStart_idx" ON "OvertimeCalculation"("businessId", "periodStart");
CREATE INDEX "OvertimeCalculation_employeeId_idx" ON "OvertimeCalculation"("employeeId");

-- AddForeignKey
ALTER TABLE "EmployeeAvailabilityWindow" ADD CONSTRAINT "EmployeeAvailabilityWindow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeAvailabilityWindow" ADD CONSTRAINT "EmployeeAvailabilityWindow_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeAvailabilityException" ADD CONSTRAINT "EmployeeAvailabilityException_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeAvailabilityException" ADD CONSTRAINT "EmployeeAvailabilityException_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimeCalculation" ADD CONSTRAINT "OvertimeCalculation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimeCalculation" ADD CONSTRAINT "OvertimeCalculation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
