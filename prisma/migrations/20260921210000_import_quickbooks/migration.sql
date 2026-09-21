-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'PREVIEWED', 'IMPORTED', 'ROLLED_BACK', 'FAILED');
CREATE TYPE "ImportRowAction" AS ENUM ('PENDING', 'VALID', 'INVALID', 'DUPLICATE', 'CREATED', 'UPDATED', 'SKIPPED', 'FAILED');
CREATE TYPE "QuickBooksConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'FILE',
    "entityType" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "headers" JSONB NOT NULL,
    "mapping" JSONB,
    "rowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportBatchRow" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "externalId" TEXT,
    "action" "ImportRowAction" NOT NULL DEFAULT 'PENDING',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "message" TEXT,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "previous" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportBatchRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportExternalId" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportExternalId_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuickBooksConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "realmId" TEXT,
    "companyName" TEXT,
    "status" "QuickBooksConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "environment" TEXT,
    "accessTokenCipher" TEXT,
    "refreshTokenCipher" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuickBooksSyncLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "QuickBooksSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportBatch_businessId_createdAt_idx" ON "ImportBatch"("businessId", "createdAt");
CREATE INDEX "ImportBatch_businessId_status_idx" ON "ImportBatch"("businessId", "status");
CREATE INDEX "ImportBatchRow_businessId_batchId_idx" ON "ImportBatchRow"("businessId", "batchId");
CREATE INDEX "ImportBatchRow_batchId_rowNumber_idx" ON "ImportBatchRow"("batchId", "rowNumber");
CREATE INDEX "ImportBatchRow_businessId_entityType_externalId_idx" ON "ImportBatchRow"("businessId", "entityType", "externalId");
CREATE UNIQUE INDEX "ImportExternalId_businessId_entityType_source_externalId_key" ON "ImportExternalId"("businessId", "entityType", "source", "externalId");
CREATE INDEX "ImportExternalId_businessId_entityType_entityId_idx" ON "ImportExternalId"("businessId", "entityType", "entityId");
CREATE INDEX "ImportExternalId_batchId_idx" ON "ImportExternalId"("batchId");
CREATE UNIQUE INDEX "QuickBooksConnection_businessId_key" ON "QuickBooksConnection"("businessId");
CREATE INDEX "QuickBooksConnection_businessId_status_idx" ON "QuickBooksConnection"("businessId", "status");
CREATE INDEX "QuickBooksSyncLog_businessId_startedAt_idx" ON "QuickBooksSyncLog"("businessId", "startedAt");
CREATE INDEX "QuickBooksSyncLog_connectionId_idx" ON "QuickBooksSyncLog"("connectionId");

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportBatchRow" ADD CONSTRAINT "ImportBatchRow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatchRow" ADD CONSTRAINT "ImportBatchRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportExternalId" ADD CONSTRAINT "ImportExternalId_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuickBooksConnection" ADD CONSTRAINT "QuickBooksConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuickBooksSyncLog" ADD CONSTRAINT "QuickBooksSyncLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuickBooksSyncLog" ADD CONSTRAINT "QuickBooksSyncLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "QuickBooksConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
