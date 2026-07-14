-- Barcode scanning: ProductBarcode assignments, external cache, inventory scan sessions.
-- Existing Product.barcode / ProductVariant.barcode are preserved for display compatibility.
-- Duplicate normalized barcodes within a business are NOT assigned; they are recorded in
-- BarcodeMigrationConflict for operator review.

-- Enums
CREATE TYPE "InventoryScanMode" AS ENUM ('RECEIVE', 'CYCLE_COUNT', 'DAMAGED', 'LOST');
CREATE TYPE "InventoryScanSessionStatus" AS ENUM ('OPEN', 'APPLIED', 'CANCELLED');

-- ProductBarcode
CREATE TABLE "ProductBarcode" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "rawValue" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "format" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductBarcode_businessId_normalizedValue_key" ON "ProductBarcode"("businessId", "normalizedValue");
CREATE INDEX "ProductBarcode_productId_idx" ON "ProductBarcode"("productId");
CREATE INDEX "ProductBarcode_variantId_idx" ON "ProductBarcode"("variantId");
CREATE INDEX "ProductBarcode_businessId_idx" ON "ProductBarcode"("businessId");

ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- External product cache (public catalog data only)
CREATE TABLE "ExternalProductCache" (
    "id" TEXT NOT NULL,
    "normalizedBarcode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "productType" TEXT,
    "name" TEXT,
    "brand" TEXT,
    "description" TEXT,
    "packageSize" TEXT,
    "imageUrl" TEXT,
    "manufacturer" TEXT,
    "categoryText" TEXT,
    "rawPayload" JSONB,
    "confidence" DOUBLE PRECISION,
    "isNegative" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastHitAt" TIMESTAMP(3),
    "lookupCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExternalProductCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalProductCache_normalizedBarcode_key" ON "ExternalProductCache"("normalizedBarcode");
CREATE INDEX "ExternalProductCache_expiresAt_idx" ON "ExternalProductCache"("expiresAt");
CREATE INDEX "ExternalProductCache_source_idx" ON "ExternalProductCache"("source");

-- Migration conflict report
CREATE TABLE "BarcodeMigrationConflict" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "rawValues" TEXT[],
    "productIds" TEXT[],
    "variantIds" TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarcodeMigrationConflict_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BarcodeMigrationConflict_businessId_idx" ON "BarcodeMigrationConflict"("businessId");
CREATE INDEX "BarcodeMigrationConflict_normalizedValue_idx" ON "BarcodeMigrationConflict"("normalizedValue");

ALTER TABLE "BarcodeMigrationConflict" ADD CONSTRAINT "BarcodeMigrationConflict_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Inventory scan sessions
CREATE TABLE "InventoryScanSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "mode" "InventoryScanMode" NOT NULL,
    "status" "InventoryScanSessionStatus" NOT NULL DEFAULT 'OPEN',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryScanSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryScanSession_idempotencyKey_key" ON "InventoryScanSession"("idempotencyKey");
CREATE INDEX "InventoryScanSession_businessId_idx" ON "InventoryScanSession"("businessId");
CREATE INDEX "InventoryScanSession_locationId_idx" ON "InventoryScanSession"("locationId");
CREATE INDEX "InventoryScanSession_employeeId_idx" ON "InventoryScanSession"("employeeId");
CREATE INDEX "InventoryScanSession_status_idx" ON "InventoryScanSession"("status");

ALTER TABLE "InventoryScanSession" ADD CONSTRAINT "InventoryScanSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryScanSession" ADD CONSTRAINT "InventoryScanSession_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryScanSession" ADD CONSTRAINT "InventoryScanSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InventoryScanLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "normalizedCode" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "scannedQty" INTEGER NOT NULL DEFAULT 0,
    "proposedDelta" INTEGER NOT NULL,

    CONSTRAINT "InventoryScanLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryScanLine_sessionId_inventoryItemId_key" ON "InventoryScanLine"("sessionId", "inventoryItemId");
CREATE INDEX "InventoryScanLine_sessionId_idx" ON "InventoryScanLine"("sessionId");
CREATE INDEX "InventoryScanLine_productId_idx" ON "InventoryScanLine"("productId");

ALTER TABLE "InventoryScanLine" ADD CONSTRAINT "InventoryScanLine_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventoryScanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Backfill ProductBarcode from Product / ProductVariant ───────────────────
-- Normalization in SQL mirrors the TypeScript rules for common GTIN cases:
-- strip whitespace, uppercase alphanumerics; for pure digits of length 8–14 with
-- valid structure, pad to GTIN-14 when check digit validates.

CREATE OR REPLACE FUNCTION nexapos_gtin_check_digit(body TEXT) RETURNS INT AS $$
DECLARE
  digits TEXT := regexp_replace(body, '\D', '', 'g');
  sum INT := 0;
  i INT;
  d INT;
  len INT;
BEGIN
  len := length(digits);
  FOR i IN 0..len-1 LOOP
    d := substr(digits, len - i, 1)::INT;
    IF i % 2 = 0 THEN
      sum := sum + d * 3;
    ELSE
      sum := sum + d;
    END IF;
  END LOOP;
  RETURN (10 - (sum % 10)) % 10;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION nexapos_normalize_barcode(raw TEXT) RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
  digits TEXT;
  len INT;
  body TEXT;
  check_d INT;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  cleaned := regexp_replace(btrim(raw), '[[:space:]]+', '', 'g');
  IF cleaned ~ '^\d+$' THEN
    digits := cleaned;
    len := length(digits);
    IF len BETWEEN 8 AND 14 THEN
      body := left(digits, len - 1);
      check_d := right(digits, 1)::INT;
      IF nexapos_gtin_check_digit(body) = check_d THEN
        RETURN lpad(digits, 14, '0');
      END IF;
    END IF;
    RETURN digits;
  END IF;
  RETURN upper(cleaned);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Staging of candidate assignments
CREATE TEMP TABLE _barcode_candidates (
  business_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  format TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT true
) ON COMMIT DROP;

INSERT INTO _barcode_candidates (business_id, product_id, variant_id, raw_value, normalized_value, format, is_primary)
SELECT
  p."businessId",
  p."id",
  NULL,
  p."barcode",
  nexapos_normalize_barcode(p."barcode"),
  CASE
    WHEN length(regexp_replace(btrim(p."barcode"), '[[:space:]]+', '', 'g')) = 12 THEN 'UPC_A'
    WHEN length(regexp_replace(btrim(p."barcode"), '[[:space:]]+', '', 'g')) = 13 THEN 'EAN_13'
    WHEN length(regexp_replace(btrim(p."barcode"), '[[:space:]]+', '', 'g')) = 8 THEN 'EAN_8'
    WHEN length(regexp_replace(btrim(p."barcode"), '[[:space:]]+', '', 'g')) = 14 THEN 'GTIN_14'
    ELSE 'OTHER'
  END,
  true
FROM "Product" p
WHERE p."barcode" IS NOT NULL
  AND btrim(p."barcode") <> ''
  AND p."deletedAt" IS NULL
  AND nexapos_normalize_barcode(p."barcode") IS NOT NULL;

INSERT INTO _barcode_candidates (business_id, product_id, variant_id, raw_value, normalized_value, format, is_primary)
SELECT
  p."businessId",
  v."productId",
  v."id",
  v."barcode",
  nexapos_normalize_barcode(v."barcode"),
  CASE
    WHEN length(regexp_replace(btrim(v."barcode"), '[[:space:]]+', '', 'g')) = 12 THEN 'UPC_A'
    WHEN length(regexp_replace(btrim(v."barcode"), '[[:space:]]+', '', 'g')) = 13 THEN 'EAN_13'
    WHEN length(regexp_replace(btrim(v."barcode"), '[[:space:]]+', '', 'g')) = 8 THEN 'EAN_8'
    WHEN length(regexp_replace(btrim(v."barcode"), '[[:space:]]+', '', 'g')) = 14 THEN 'GTIN_14'
    ELSE 'OTHER'
  END,
  false
FROM "ProductVariant" v
JOIN "Product" p ON p."id" = v."productId"
WHERE v."barcode" IS NOT NULL
  AND btrim(v."barcode") <> ''
  AND p."deletedAt" IS NULL
  AND nexapos_normalize_barcode(v."barcode") IS NOT NULL;

-- Record conflicts (same business + normalized value on more than one product/variant row)
INSERT INTO "BarcodeMigrationConflict" (
  "id", "businessId", "normalizedValue", "rawValues", "productIds", "variantIds", "note", "createdAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  c.business_id,
  c.normalized_value,
  array_agg(DISTINCT c.raw_value),
  array_agg(DISTINCT c.product_id),
  coalesce(array_agg(DISTINCT c.variant_id) FILTER (WHERE c.variant_id IS NOT NULL), ARRAY[]::text[]),
  'Duplicate normalized barcode within business — not assigned to ProductBarcode. Resolve manually.',
  CURRENT_TIMESTAMP
FROM _barcode_candidates c
GROUP BY c.business_id, c.normalized_value
HAVING COUNT(*) > 1
   OR COUNT(DISTINCT c.product_id) > 1
   OR COUNT(DISTINCT coalesce(c.variant_id, '')) > 1;

-- Assign only non-conflicting barcodes
INSERT INTO "ProductBarcode" (
  "id", "businessId", "productId", "variantId", "rawValue", "normalizedValue", "format", "isPrimary", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || c.product_id || c.normalized_value),
  c.business_id,
  c.product_id,
  c.variant_id,
  c.raw_value,
  c.normalized_value,
  c.format,
  c.is_primary,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM _barcode_candidates c
WHERE NOT EXISTS (
  SELECT 1
  FROM "BarcodeMigrationConflict" conf
  WHERE conf."businessId" = c.business_id
    AND conf."normalizedValue" = c.normalized_value
);

DROP FUNCTION IF EXISTS nexapos_normalize_barcode(TEXT);
DROP FUNCTION IF EXISTS nexapos_gtin_check_digit(TEXT);
