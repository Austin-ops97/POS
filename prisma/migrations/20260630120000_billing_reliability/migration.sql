-- Payment action required flag (SCA / 3DS authentication)
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "paymentActionRequiredAt" TIMESTAMP(3);
