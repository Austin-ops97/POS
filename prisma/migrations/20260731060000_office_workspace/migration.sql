-- Office workspace: secure documents, folders, versions, files, tags, favorites, and audit events.

CREATE TYPE "OfficeDocumentKind" AS ENUM ('RICH_TEXT', 'SCAN', 'UPLOAD', 'TEMPLATE');
CREATE TYPE "OfficeDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "OfficeFolder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "OfficeFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeDocument" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "locationId" TEXT,
    "folderId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "OfficeDocumentKind" NOT NULL DEFAULT 'RICH_TEXT',
    "status" "OfficeDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "OfficeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeDocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeDocumentFile" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'DATABASE',
    "storageKey" TEXT,
    "data" BYTEA,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "OfficeDocumentFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeTag" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficeDocumentTag" (
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "OfficeDocumentTag_pkey" PRIMARY KEY ("documentId", "tagId")
);

CREATE TABLE "OfficeDocumentFavorite" (
    "documentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeDocumentFavorite_pkey" PRIMARY KEY ("documentId", "employeeId")
);

CREATE TABLE "OfficeAuditEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT,
    "documentId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficeFolder_businessId_parentId_name_key" ON "OfficeFolder"("businessId", "parentId", "name");
CREATE INDEX "OfficeFolder_businessId_deletedAt_idx" ON "OfficeFolder"("businessId", "deletedAt");
CREATE INDEX "OfficeFolder_parentId_idx" ON "OfficeFolder"("parentId");
CREATE INDEX "OfficeDocument_businessId_deletedAt_updatedAt_idx" ON "OfficeDocument"("businessId", "deletedAt", "updatedAt");
CREATE INDEX "OfficeDocument_businessId_status_idx" ON "OfficeDocument"("businessId", "status");
CREATE INDEX "OfficeDocument_folderId_idx" ON "OfficeDocument"("folderId");
CREATE INDEX "OfficeDocument_locationId_idx" ON "OfficeDocument"("locationId");
CREATE INDEX "OfficeDocument_createdById_idx" ON "OfficeDocument"("createdById");
CREATE UNIQUE INDEX "OfficeDocumentVersion_documentId_version_key" ON "OfficeDocumentVersion"("documentId", "version");
CREATE INDEX "OfficeDocumentVersion_documentId_createdAt_idx" ON "OfficeDocumentVersion"("documentId", "createdAt");
CREATE INDEX "OfficeDocumentFile_documentId_sortOrder_idx" ON "OfficeDocumentFile"("documentId", "sortOrder");
CREATE INDEX "OfficeDocumentFile_storageKey_idx" ON "OfficeDocumentFile"("storageKey");
CREATE INDEX "OfficeDocumentFile_checksum_idx" ON "OfficeDocumentFile"("checksum");
CREATE UNIQUE INDEX "OfficeTag_businessId_name_key" ON "OfficeTag"("businessId", "name");
CREATE INDEX "OfficeTag_businessId_idx" ON "OfficeTag"("businessId");
CREATE INDEX "OfficeDocumentTag_tagId_idx" ON "OfficeDocumentTag"("tagId");
CREATE INDEX "OfficeDocumentFavorite_employeeId_idx" ON "OfficeDocumentFavorite"("employeeId");
CREATE INDEX "OfficeAuditEvent_businessId_createdAt_idx" ON "OfficeAuditEvent"("businessId", "createdAt");
CREATE INDEX "OfficeAuditEvent_documentId_idx" ON "OfficeAuditEvent"("documentId");
CREATE INDEX "OfficeAuditEvent_action_idx" ON "OfficeAuditEvent"("action");

ALTER TABLE "OfficeFolder" ADD CONSTRAINT "OfficeFolder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeFolder" ADD CONSTRAINT "OfficeFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OfficeFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfficeFolder" ADD CONSTRAINT "OfficeFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficeDocument" ADD CONSTRAINT "OfficeDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeDocument" ADD CONSTRAINT "OfficeDocument_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfficeDocument" ADD CONSTRAINT "OfficeDocument_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "OfficeFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfficeDocument" ADD CONSTRAINT "OfficeDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficeDocument" ADD CONSTRAINT "OfficeDocument_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentVersion" ADD CONSTRAINT "OfficeDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentVersion" ADD CONSTRAINT "OfficeDocumentVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentFile" ADD CONSTRAINT "OfficeDocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentFile" ADD CONSTRAINT "OfficeDocumentFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficeTag" ADD CONSTRAINT "OfficeTag_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentTag" ADD CONSTRAINT "OfficeDocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentTag" ADD CONSTRAINT "OfficeDocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "OfficeTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentFavorite" ADD CONSTRAINT "OfficeDocumentFavorite_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeDocumentFavorite" ADD CONSTRAINT "OfficeDocumentFavorite_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeAuditEvent" ADD CONSTRAINT "OfficeAuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeAuditEvent" ADD CONSTRAINT "OfficeAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OfficeAuditEvent" ADD CONSTRAINT "OfficeAuditEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable Office for existing businesses. New businesses receive it through defaultEnabledModules().
INSERT INTO "ModuleSetting" ("id", "businessId", "module", "enabled", "createdAt", "updatedAt")
SELECT 'mod_' || md5("id" || ':OFFICE'), "id", 'OFFICE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Business"
ON CONFLICT ("businessId", "module") DO NOTHING;

-- Seed the new permissions with deterministic IDs for already-provisioned installations.
WITH office_permissions("key") AS (
  VALUES
    ('view_documents'), ('create_documents'), ('edit_documents'), ('delete_documents'),
    ('scan_documents'), ('manage_document_folders'), ('manage_document_templates'),
    ('approve_documents'), ('view_sensitive_documents'), ('manage_office_settings')
)
INSERT INTO "Permission" ("id", "key", "name", "description", "createdAt", "updatedAt")
SELECT
  'perm_' || md5("key"),
  "key",
  initcap(replace("key", '_', ' ')),
  'Permission: ' || "key",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM office_permissions
ON CONFLICT ("key") DO NOTHING;

WITH role_permissions("roleName", "permissionKey") AS (
  VALUES
    ('Owner','view_documents'), ('Owner','create_documents'), ('Owner','edit_documents'), ('Owner','delete_documents'), ('Owner','scan_documents'), ('Owner','manage_document_folders'), ('Owner','manage_document_templates'), ('Owner','approve_documents'), ('Owner','view_sensitive_documents'), ('Owner','manage_office_settings'),
    ('Admin','view_documents'), ('Admin','create_documents'), ('Admin','edit_documents'), ('Admin','delete_documents'), ('Admin','scan_documents'), ('Admin','manage_document_folders'), ('Admin','manage_document_templates'), ('Admin','approve_documents'), ('Admin','view_sensitive_documents'), ('Admin','manage_office_settings'),
    ('Manager','view_documents'), ('Manager','create_documents'), ('Manager','edit_documents'), ('Manager','delete_documents'), ('Manager','scan_documents'), ('Manager','manage_document_folders'), ('Manager','manage_document_templates'), ('Manager','approve_documents'),
    ('Cashier','view_documents'), ('Cashier','create_documents'), ('Cashier','scan_documents'),
    ('Inventory Staff','view_documents'), ('Inventory Staff','create_documents'), ('Inventory Staff','edit_documents'), ('Inventory Staff','scan_documents'),
    ('Reports Viewer','view_documents'),
    ('Finance','view_documents'), ('Finance','create_documents'), ('Finance','edit_documents'), ('Finance','delete_documents'), ('Finance','scan_documents'), ('Finance','manage_document_folders'), ('Finance','manage_document_templates'), ('Finance','approve_documents'), ('Finance','view_sensitive_documents'), ('Finance','manage_office_settings')
)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT
  'rp_' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id"
FROM role_permissions rp
JOIN "Role" r ON r."name" = rp."roleName"
JOIN "Permission" p ON p."key" = rp."permissionKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
