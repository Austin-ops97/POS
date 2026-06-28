-- Add UNPAID status and webhook idempotency table
CREATE TYPE "SubscriptionStatus_new" AS ENUM (
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELED',
  'INCOMPLETE',
  'UNPAID'
);

ALTER TABLE "Subscription" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Subscription"
  ALTER COLUMN "status" TYPE "SubscriptionStatus_new"
  USING ("status"::text::"SubscriptionStatus_new");

DROP TYPE "SubscriptionStatus";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
ALTER TABLE "Subscription" ALTER COLUMN "status" SET DEFAULT 'TRIALING';

ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "pastDueSince" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");
