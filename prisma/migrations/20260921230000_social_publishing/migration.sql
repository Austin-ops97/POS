-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'LINKEDIN');
CREATE TYPE "SocialConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');
CREATE TYPE "SocialPostStatus" AS ENUM ('SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED');
CREATE TYPE "SocialDeliveryStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "status" "SocialConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "externalId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accountKind" TEXT NOT NULL,
    "parentExternalId" TEXT,
    "accessTokenCipher" TEXT,
    "refreshTokenCipher" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "imageName" TEXT,
    "imageMime" TEXT,
    "imageData" BYTEA,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialDelivery" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "status" "SocialDeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "externalPostId" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialConnection_businessId_platform_externalId_key" ON "SocialConnection"("businessId", "platform", "externalId");
CREATE INDEX "SocialConnection_businessId_status_idx" ON "SocialConnection"("businessId", "status");
CREATE INDEX "SocialPost_businessId_createdAt_idx" ON "SocialPost"("businessId", "createdAt");
CREATE INDEX "SocialPost_businessId_status_scheduledFor_idx" ON "SocialPost"("businessId", "status", "scheduledFor");
CREATE INDEX "SocialDelivery_businessId_postId_idx" ON "SocialDelivery"("businessId", "postId");
CREATE INDEX "SocialDelivery_connectionId_idx" ON "SocialDelivery"("connectionId");

ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
