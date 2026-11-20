-- CreateEnum
CREATE TYPE "OfficeEsignKind" AS ENUM ('QUOTE', 'CONTRACT', 'WORK_AUTHORIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "OfficeEsignStatus" AS ENUM ('SENT', 'VIEWED', 'SIGNED');

-- CreateEnum
CREATE TYPE "OfficeEsignMarkKind" AS ENUM ('DRAW', 'TYPE');

-- CreateTable
CREATE TABLE "OfficeEsignRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "documentId" TEXT,
    "customerId" TEXT,
    "kind" "OfficeEsignKind" NOT NULL DEFAULT 'CONTRACT',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "OfficeEsignStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "signatureKind" "OfficeEsignMarkKind",
    "signatureData" TEXT,
    "signedPdf" BYTEA,
    "contentSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeEsignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeEsignEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficeEsignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficeEsignRequest_tokenHash_key" ON "OfficeEsignRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "OfficeEsignRequest_businessId_status_createdAt_idx" ON "OfficeEsignRequest"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OfficeEsignRequest_documentId_idx" ON "OfficeEsignRequest"("documentId");

-- CreateIndex
CREATE INDEX "OfficeEsignRequest_customerId_idx" ON "OfficeEsignRequest"("customerId");

-- CreateIndex
CREATE INDEX "OfficeEsignEvent_requestId_createdAt_idx" ON "OfficeEsignEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "OfficeEsignRequest" ADD CONSTRAINT "OfficeEsignRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeEsignRequest" ADD CONSTRAINT "OfficeEsignRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeEsignRequest" ADD CONSTRAINT "OfficeEsignRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeEsignRequest" ADD CONSTRAINT "OfficeEsignRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeEsignEvent" ADD CONSTRAINT "OfficeEsignEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OfficeEsignRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
