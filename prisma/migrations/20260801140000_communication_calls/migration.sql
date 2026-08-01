-- CreateEnum
CREATE TYPE "CommunicationCallType" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "CommunicationCallStatus" AS ENUM ('CREATED', 'RINGING', 'ACTIVE', 'MISSED', 'DECLINED', 'ENDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallParticipantStatus" AS ENUM ('INVITED', 'RINGING', 'JOINED', 'LEFT', 'DECLINED', 'MISSED');

-- AlterTable
ALTER TABLE "BusinessSetting"
  ADD COLUMN IF NOT EXISTS "enableVideoCalling" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableGroupCalling" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableScreenSharing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableMissedCallEmails" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CommunicationCall" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "conversationId" TEXT,
  "startedById" TEXT NOT NULL,
  "type" "CommunicationCallType" NOT NULL DEFAULT 'VIDEO',
  "status" "CommunicationCallStatus" NOT NULL DEFAULT 'CREATED',
  "provider" TEXT NOT NULL DEFAULT 'livekit',
  "providerRoomId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "ringingAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "missedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunicationCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallParticipant" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "status" "CallParticipantStatus" NOT NULL DEFAULT 'INVITED',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt" TIMESTAMP(3),
  "leftAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "withVideo" BOOLEAN NOT NULL DEFAULT true,
  "isHost" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationCall_businessId_status_createdAt_idx" ON "CommunicationCall"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationCall_conversationId_createdAt_idx" ON "CommunicationCall"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationCall_businessId_providerRoomId_key" ON "CommunicationCall"("businessId", "providerRoomId");

-- CreateIndex
CREATE INDEX "CallParticipant_employeeId_status_idx" ON "CallParticipant"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CallParticipant_callId_employeeId_key" ON "CallParticipant"("callId", "employeeId");

-- AddForeignKey
ALTER TABLE "CommunicationCall" ADD CONSTRAINT "CommunicationCall_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationCall" ADD CONSTRAINT "CommunicationCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ConnectionConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationCall" ADD CONSTRAINT "CommunicationCall_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CommunicationCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallParticipant" ADD CONSTRAINT "CallParticipant_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
