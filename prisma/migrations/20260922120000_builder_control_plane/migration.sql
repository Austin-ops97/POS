-- Platform Builder state and audit. Feature flags stay on ModuleSetting.
-- Existing businesses are not rewritten: a missing ModuleSetting row stays enabled.

CREATE TABLE "BuilderBusinessState" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL DEFAULT 'CUSTOM',
    "customized" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuilderBusinessState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuilderBusinessState_businessId_key" ON "BuilderBusinessState"("businessId");

ALTER TABLE "BuilderBusinessState" ADD CONSTRAINT "BuilderBusinessState_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BuilderAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "businessId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuilderAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BuilderAuditEvent_createdAt_idx" ON "BuilderAuditEvent"("createdAt");
CREATE INDEX "BuilderAuditEvent_businessId_idx" ON "BuilderAuditEvent"("businessId");
CREATE INDEX "BuilderAuditEvent_action_idx" ON "BuilderAuditEvent"("action");
