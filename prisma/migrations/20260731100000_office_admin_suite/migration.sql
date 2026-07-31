-- Flexible records shared by every Office & Admin workspace. This keeps
-- assignments, due dates, search, and audit behavior consistent across tools
-- while module-specific structured values remain in metadata.
CREATE TABLE "OfficeWorkspaceRecord" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "workspace" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "dueAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "OfficeWorkspaceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfficeWorkspaceRecord_businessId_workspace_archivedAt_updatedAt_idx"
  ON "OfficeWorkspaceRecord"("businessId", "workspace", "archivedAt", "updatedAt");
CREATE INDEX "OfficeWorkspaceRecord_businessId_status_dueAt_idx"
  ON "OfficeWorkspaceRecord"("businessId", "status", "dueAt");
CREATE INDEX "OfficeWorkspaceRecord_assignedToId_status_idx"
  ON "OfficeWorkspaceRecord"("assignedToId", "status");

ALTER TABLE "OfficeWorkspaceRecord"
  ADD CONSTRAINT "OfficeWorkspaceRecord_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficeWorkspaceRecord"
  ADD CONSTRAINT "OfficeWorkspaceRecord_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "EmployeeProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficeWorkspaceRecord"
  ADD CONSTRAINT "OfficeWorkspaceRecord_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "EmployeeProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
