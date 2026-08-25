-- Reminder alert tracking, in-app notifications, and employee reminder preferences.
-- Idempotent so a failed Vercel `migrate deploy` can be resolved and re-applied.

ALTER TABLE "EmployeeProfile"
  ADD COLUMN IF NOT EXISTS "emailRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "inAppRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ReminderDelivery"
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT,
  ADD COLUMN IF NOT EXISTS "inAppStatus" "ReminderDeliveryStatus",
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailSkipReason" TEXT,
  ADD COLUMN IF NOT EXISTS "inAppSkipReason" TEXT,
  ADD COLUMN IF NOT EXISTS "inAppNotifiedAt" TIMESTAMP(3);

UPDATE "ReminderDelivery"
SET "dedupeKey" = CASE
  WHEN "employeeId" IS NOT NULL THEN 'employee:' || "employeeId"
  WHEN "recipientEmail" IS NOT NULL AND btrim("recipientEmail") <> '' THEN 'email:' || lower("recipientEmail")
  ELSE 'row:' || "id"
END
WHERE "dedupeKey" IS NULL OR btrim("dedupeKey") = '';

-- Old uniqueness was per email. The same employee can appear on multiple emails
-- for one occurrence; suffix extras so the new unique index can be created.
UPDATE "ReminderDelivery" AS rd
SET "dedupeKey" = rd."dedupeKey" || ':row:' || rd.id
WHERE rd.id IN (
  SELECT ranked.id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "reminderId", "occurrenceAt", "dedupeKey"
        ORDER BY "createdAt" ASC, id ASC
      ) AS rn
    FROM "ReminderDelivery"
  ) ranked
  WHERE ranked.rn > 1
);

ALTER TABLE "ReminderDelivery" ALTER COLUMN "dedupeKey" SET NOT NULL;
ALTER TABLE "ReminderDelivery" ALTER COLUMN "recipientEmail" DROP NOT NULL;

ALTER TABLE "ReminderDelivery" DROP CONSTRAINT IF EXISTS "ReminderDelivery_reminderId_occurrenceAt_recipientEmail_key";
DROP INDEX IF EXISTS "ReminderDelivery_reminderId_occurrenceAt_recipientEmail_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ReminderDelivery_reminderId_occurrenceAt_dedupeKey_key"
  ON "ReminderDelivery"("reminderId", "occurrenceAt", "dedupeKey");

CREATE TABLE IF NOT EXISTS "AppNotification" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "AppNotification_deliveryId_key" ON "AppNotification"("deliveryId");
CREATE INDEX IF NOT EXISTS "AppNotification_employeeId_readAt_idx" ON "AppNotification"("employeeId", "readAt");
CREATE INDEX IF NOT EXISTS "AppNotification_businessId_createdAt_idx" ON "AppNotification"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "AppNotification_reminderId_idx" ON "AppNotification"("reminderId");

DO $$ BEGIN
  ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "ReminderDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
