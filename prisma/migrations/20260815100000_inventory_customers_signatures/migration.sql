CREATE TYPE "SignatureDataFormat" AS ENUM ('PNG', 'SVG');

ALTER TABLE "BusinessSetting"
  ADD COLUMN "enableDigitalSignatures" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showSignatureOnReceipt" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "InventoryReceipt" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "employeeId" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(10,2),
  "supplier" TEXT,
  "referenceNumber" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryReceipt_businessId_receivedAt_idx" ON "InventoryReceipt"("businessId", "receivedAt");
CREATE INDEX "InventoryReceipt_inventoryItemId_receivedAt_idx" ON "InventoryReceipt"("inventoryItemId", "receivedAt");
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Signature" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT,
  "employeeId" TEXT,
  "signerName" TEXT NOT NULL,
  "consentText" TEXT NOT NULL,
  "dataFormat" "SignatureDataFormat" NOT NULL,
  "signatureData" TEXT NOT NULL,
  "deviceSessionId" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Signature_businessId_orderId_idx" ON "Signature"("businessId", "orderId");
CREATE INDEX "Signature_customerId_idx" ON "Signature"("customerId");
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
