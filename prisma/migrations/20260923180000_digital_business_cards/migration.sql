-- CreateEnum
CREATE TYPE "DigitalCardStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');
CREATE TYPE "DigitalCardSocialNetwork" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'CUSTOM');

-- CreateTable
CREATE TABLE "DigitalBusinessCard" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "slug" TEXT,
    "status" "DigitalCardStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "businessName" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "email" TEXT,
    "website" TEXT,
    "note" TEXT,
    "logoUrl" TEXT,
    "logoStorageKey" TEXT,
    "logoMime" TEXT,
    "logoData" BYTEA,
    "theme" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalBusinessCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalCardPhone" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "DigitalCardPhone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalCardAddress" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "line1" TEXT NOT NULL,
    "line2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "DigitalCardAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DigitalCardSocialLink" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "network" "DigitalCardSocialNetwork" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "DigitalCardSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalBusinessCard_slug_key" ON "DigitalBusinessCard"("slug");
CREATE INDEX "DigitalBusinessCard_businessId_updatedAt_idx" ON "DigitalBusinessCard"("businessId", "updatedAt");
CREATE INDEX "DigitalBusinessCard_businessId_status_idx" ON "DigitalBusinessCard"("businessId", "status");
CREATE INDEX "DigitalBusinessCard_createdById_idx" ON "DigitalBusinessCard"("createdById");
CREATE INDEX "DigitalCardPhone_cardId_sortOrder_idx" ON "DigitalCardPhone"("cardId", "sortOrder");
CREATE INDEX "DigitalCardAddress_cardId_sortOrder_idx" ON "DigitalCardAddress"("cardId", "sortOrder");
CREATE INDEX "DigitalCardSocialLink_cardId_sortOrder_idx" ON "DigitalCardSocialLink"("cardId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DigitalBusinessCard" ADD CONSTRAINT "DigitalBusinessCard_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalBusinessCard" ADD CONSTRAINT "DigitalBusinessCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DigitalCardPhone" ADD CONSTRAINT "DigitalCardPhone_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "DigitalBusinessCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalCardAddress" ADD CONSTRAINT "DigitalCardAddress_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "DigitalBusinessCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DigitalCardSocialLink" ADD CONSTRAINT "DigitalCardSocialLink_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "DigitalBusinessCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
