-- Fine-tune: FKs for orphan businessId columns, hot-path indexes, SKU uniqueness

-- Deduplicate product SKUs within a business (keep newest row)
UPDATE "Product" AS p
SET sku = NULL
WHERE p.sku IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "Product" AS newer
    WHERE newer."businessId" = p."businessId"
      AND newer.sku = p.sku
      AND newer.id <> p.id
      AND newer."createdAt" > p."createdAt"
  );

CREATE UNIQUE INDEX IF NOT EXISTS "Product_businessId_sku_key" ON "Product"("businessId", "sku");
CREATE INDEX IF NOT EXISTS "Product_businessId_deletedAt_idx" ON "Product"("businessId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Customer_businessId_deletedAt_idx" ON "Customer"("businessId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Order_businessId_paidAt_idx" ON "Order"("businessId", "paidAt");
CREATE INDEX IF NOT EXISTS "Order_businessId_status_createdAt_idx" ON "Order"("businessId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "TimeEntry_businessId_status_idx" ON "TimeEntry"("businessId", "status");

-- Add missing foreign keys (ON DELETE CASCADE to match Business ownership)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ModifierGroup_businessId_fkey'
  ) THEN
    ALTER TABLE "ModifierGroup"
      ADD CONSTRAINT "ModifierGroup_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_businessId_fkey'
  ) THEN
    ALTER TABLE "InventoryMovement"
      ADD CONSTRAINT "InventoryMovement_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_businessId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Refund_businessId_fkey'
  ) THEN
    ALTER TABLE "Refund"
      ADD CONSTRAINT "Refund_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Receipt_businessId_fkey'
  ) THEN
    ALTER TABLE "Receipt"
      ADD CONSTRAINT "Receipt_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TerminalReader_businessId_fkey'
  ) THEN
    ALTER TABLE "TerminalReader"
      ADD CONSTRAINT "TerminalReader_businessId_fkey"
      FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
