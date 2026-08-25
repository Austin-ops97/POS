-- Reminder alert tracking, in-app notifications, and employee reminder preferences.

ALTER TABLE "EmployeeProfile" ADD COLUMN "emailRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EmployeeProfile" ADD COLUMN "inAppRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ReminderDelivery" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "ReminderDelivery" ADD COLUMN "inAppStatus" "ReminderDeliveryStatus";
ALTER TABLE "ReminderDelivery" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "ReminderDelivery" ADD COLUMN "emailSkipReason" TEXT;
ALTER TABLE "ReminderDelivery" ADD COLUMN "inAppSkipReason" TEXT;
ALTER TABLE "ReminderDelivery" ADD COLUMN "inAppNotifiedAt" TIMESTAMP(3);

UPDATE "ReminderDelivery"
SET "dedupeKey" = CASE
  WHEN "employeeId" IS NOT NULL THEN 'employee:' || "employeeId"
  ELSE 'email:' || lower("recipientEmail")
END
WHERE "dedupeKey" IS NULL;

ALTER TABLE "ReminderDelivery" ALTER COLUMN "dedupeKey" SET NOT NULL;
ALTER TABLE "ReminderDelivery" ALTER COLUMN "recipientEmail" DROP NOT NULL;

DROP INDEX IF EXISTS "ReminderDelivery_reminderId_occurrenceAt_recipientEmail_key";

CREATE UNIQUE INDEX "ReminderDelivery_reminderId_occurrenceAt_dedupeKey_key"
  ON "ReminderDelivery"("reminderId", "occurrenceAt", "dedupeKey");

CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "reminderId" TEXT,
    "deliveryId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppNotification_deliveryId_key" ON "AppNotification"("deliveryId");
CREATE INDEX "AppNotification_employeeId_readAt_idx" ON "AppNotification"("employeeId", "readAt");
CREATE INDEX "AppNotification_businessId_createdAt_idx" ON "AppNotification"("businessId", "createdAt");
CREATE INDEX "AppNotification_reminderId_idx" ON "AppNotification"("reminderId");

ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ReminderDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
