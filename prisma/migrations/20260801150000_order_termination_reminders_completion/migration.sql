-- Enums
CREATE TYPE "OrderTerminationReason" AS ENUM (
  'CUSTOMER_CANCELED',
  'DUPLICATE_ORDER',
  'ENTERED_BY_MISTAKE',
  'PAYMENT_ABANDONED',
  'REGISTER_INTERRUPTION',
  'OTHER'
);

CREATE TYPE "ReminderRecurrence" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY');

CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TYPE "ProjectApprovalAction" AS ENUM (
  'SUBMITTED',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'RESUBMITTED',
  'REOPENED'
);

-- AuditAction extensions
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_TERMINATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROJECT_REMINDER';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROJECT_COMPLETION';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROJECT_APPROVAL';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMUNICATION_CALL';

-- Order termination columns
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terminatedById" TEXT,
  ADD COLUMN IF NOT EXISTS "terminatedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "terminationReason" "OrderTerminationReason",
  ADD COLUMN IF NOT EXISTS "terminationNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "inventoryRestoredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_businessId_terminatedAt_idx" ON "Order"("businessId", "terminatedAt");

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_terminatedById_fkey"
    FOREIGN KEY ("terminatedById") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Business feature settings
ALTER TABLE "BusinessSetting"
  ADD COLUMN IF NOT EXISTS "enableOrderTermination" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableProjectReminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableProjectCompletion" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "requireCompletionPhotos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "minCompletionPhotos" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "requireSupervisorApproval" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "allowReopenApprovedProjects" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "defaultProjectSupervisorId" TEXT;

-- Project reminders
CREATE TABLE IF NOT EXISTS "ProjectReminder" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "nextSendAt" TIMESTAMP(3) NOT NULL,
  "lastSentAt" TIMESTAMP(3),
  "recurrence" "ReminderRecurrence" NOT NULL DEFAULT 'ONE_TIME',
  "intervalCount" INTEGER NOT NULL DEFAULT 1,
  "sendBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "stopAt" TIMESTAMP(3),
  "maxOccurrences" INTEGER,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
  "recipients" JSONB NOT NULL,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ProjectReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReminderDelivery" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "reminderId" TEXT NOT NULL,
  "occurrenceAt" TIMESTAMP(3) NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "employeeId" TEXT,
  CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectReminder_businessId_nextSendAt_enabled_paused_idx"
  ON "ProjectReminder"("businessId", "nextSendAt", "enabled", "paused");
CREATE INDEX IF NOT EXISTS "ProjectReminder_projectId_deletedAt_idx"
  ON "ProjectReminder"("projectId", "deletedAt");
CREATE INDEX IF NOT EXISTS "ProjectReminder_claimToken_idx" ON "ProjectReminder"("claimToken");
CREATE UNIQUE INDEX IF NOT EXISTS "ReminderDelivery_reminderId_occurrenceAt_recipientEmail_key"
  ON "ReminderDelivery"("reminderId", "occurrenceAt", "recipientEmail");
CREATE INDEX IF NOT EXISTS "ReminderDelivery_businessId_status_createdAt_idx"
  ON "ReminderDelivery"("businessId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ReminderDelivery_reminderId_occurrenceAt_idx"
  ON "ReminderDelivery"("reminderId", "occurrenceAt");

DO $$ BEGIN
  ALTER TABLE "ProjectReminder" ADD CONSTRAINT "ProjectReminder_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectReminder" ADD CONSTRAINT "ProjectReminder_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "OfficeWorkspaceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectReminder" ADD CONSTRAINT "ProjectReminder_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_reminderId_fkey"
    FOREIGN KEY ("reminderId") REFERENCES "ProjectReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Project completion
CREATE TABLE IF NOT EXISTS "ProjectSubmission" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "supervisorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  "completionNote" TEXT,
  "reviewComment" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectAttachment" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "submissionId" TEXT,
  "uploadedById" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "storageUrl" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "caption" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectApprovalEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "submissionId" TEXT,
  "actorId" TEXT NOT NULL,
  "action" "ProjectApprovalAction" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectApprovalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProjectSubmission_businessId_status_submittedAt_idx"
  ON "ProjectSubmission"("businessId", "status", "submittedAt");
CREATE INDEX IF NOT EXISTS "ProjectSubmission_projectId_submittedAt_idx"
  ON "ProjectSubmission"("projectId", "submittedAt");
CREATE INDEX IF NOT EXISTS "ProjectSubmission_supervisorId_status_idx"
  ON "ProjectSubmission"("supervisorId", "status");
CREATE INDEX IF NOT EXISTS "ProjectAttachment_businessId_projectId_deletedAt_idx"
  ON "ProjectAttachment"("businessId", "projectId", "deletedAt");
CREATE INDEX IF NOT EXISTS "ProjectAttachment_submissionId_idx" ON "ProjectAttachment"("submissionId");
CREATE INDEX IF NOT EXISTS "ProjectApprovalEvent_businessId_projectId_createdAt_idx"
  ON "ProjectApprovalEvent"("businessId", "projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectApprovalEvent_submissionId_createdAt_idx"
  ON "ProjectApprovalEvent"("submissionId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "OfficeWorkspaceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectSubmission" ADD CONSTRAINT "ProjectSubmission_supervisorId_fkey"
    FOREIGN KEY ("supervisorId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "OfficeWorkspaceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "ProjectSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectApprovalEvent" ADD CONSTRAINT "ProjectApprovalEvent_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectApprovalEvent" ADD CONSTRAINT "ProjectApprovalEvent_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "OfficeWorkspaceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectApprovalEvent" ADD CONSTRAINT "ProjectApprovalEvent_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "ProjectSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectApprovalEvent" ADD CONSTRAINT "ProjectApprovalEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed new permissions
WITH new_permissions("key") AS (
  VALUES
    ('terminate_order'),
    ('manage_project_reminders'),
    ('submit_project_completion'),
    ('approve_project_completion'),
    ('reopen_project'),
    ('start_connection_calls'),
    ('join_connection_calls'),
    ('moderate_connection_calls')
)
INSERT INTO "Permission" ("id", "key", "name", "description", "createdAt", "updatedAt")
SELECT 'perm_' || md5("key"), "key", initcap(replace("key", '_', ' ')), 'Permission: ' || "key", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM new_permissions
ON CONFLICT ("key") DO NOTHING;

-- Role grants (Owner gets all via ensureRolesAndPermissions at runtime; seed common roles here)
WITH role_permissions("roleName", "permissionKey") AS (
  VALUES
    ('Admin','terminate_order'),
    ('Admin','manage_project_reminders'),
    ('Admin','submit_project_completion'),
    ('Admin','approve_project_completion'),
    ('Admin','reopen_project'),
    ('Admin','start_connection_calls'),
    ('Admin','join_connection_calls'),
    ('Admin','moderate_connection_calls'),
    ('Manager','terminate_order'),
    ('Manager','manage_project_reminders'),
    ('Manager','submit_project_completion'),
    ('Manager','approve_project_completion'),
    ('Manager','reopen_project'),
    ('Manager','start_connection_calls'),
    ('Manager','join_connection_calls'),
    ('Manager','moderate_connection_calls'),
    ('Cashier','submit_project_completion'),
    ('Cashier','join_connection_calls'),
    ('Inventory Staff','submit_project_completion'),
    ('Inventory Staff','join_connection_calls'),
    ('Reports Viewer','join_connection_calls'),
    ('Finance','manage_project_reminders'),
    ('Finance','join_connection_calls'),
    ('Owner','terminate_order'),
    ('Owner','manage_project_reminders'),
    ('Owner','submit_project_completion'),
    ('Owner','approve_project_completion'),
    ('Owner','reopen_project'),
    ('Owner','start_connection_calls'),
    ('Owner','join_connection_calls'),
    ('Owner','moderate_connection_calls')
)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT 'rp_' || md5(r."name" || p."key"), r."id", p."id"
FROM role_permissions rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Enable new modules for existing businesses (default on)
INSERT INTO "ModuleSetting" ("id", "businessId", "module", "enabled", "createdAt", "updatedAt")
SELECT 'mod_' || md5(b."id" || m.module), b."id", m.module, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Business" b
CROSS JOIN (VALUES
  ('ORDER_TERMINATION'),
  ('PROJECT_REMINDERS'),
  ('PROJECT_COMPLETION'),
  ('VIDEO_CALLING')
) AS m(module)
ON CONFLICT ("businessId", "module") DO NOTHING;
