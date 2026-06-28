-- Cash tender/change on payments
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "amountTendered" DECIMAL(10, 2);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "changeDue" DECIMAL(10, 2);

-- Receipt email/print tracking
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "lastEmailedAt" TIMESTAMP(3);
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);

-- Extended receipt settings
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "showBusinessEmailOnReceipt" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "showBusinessPhoneOnReceipt" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BusinessSetting" ADD COLUMN IF NOT EXISTS "returnPolicy" TEXT;
