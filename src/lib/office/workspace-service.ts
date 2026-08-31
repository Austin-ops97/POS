import type { Prisma } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { getOfficeSuiteModule } from "@/lib/office/suite";
import {
  officeWorkspaceRecordCreateSchema,
  officeWorkspaceRecordUpdateSchema,
} from "@/lib/validations/office-workspace";
import { workspaceRecordListFilter } from "@/lib/office/workspace-archive";

export type OfficeWorkspaceRecordSummary = {
  id: string;
  workspace: string;
  title: string;
  summary: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  createdBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
};

function requirePermission(ctx: AuthContext, permission: string) {
  if (!hasPermission(ctx, permission)) throw new Error(`Missing permission: ${permission}`);
}
function requireCreateOrEdit(ctx: AuthContext, createdById: string) {
  if (hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS)) return;
  if (hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS) && createdById === ctx.employee.id) return;
  throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
}
function requireWorkspace(workspace: string) {
  if (!getOfficeSuiteModule(workspace)) throw new Error("Office workspace not found");
}

function serializeRecord(record: {
  id: string;
  workspace: string;
  title: string;
  summary: string | null;
  status: string;
  priority: string;
  dueAt: Date | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  createdBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
}): OfficeWorkspaceRecordSummary {
  return {
    ...record,
    metadata: record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata as Record<string, unknown>
      : null,
    dueAt: record.dueAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString() ?? null,
  };
}

const recordPeople = {
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

export async function listOfficeWorkspaceRecords(
  ctx: AuthContext,
  workspace: string,
  options: { q?: string; limit?: number; includeComplete?: boolean; archived?: boolean } = {}
) {
  requirePermission(ctx, PERMISSIONS.VIEW_DOCUMENTS);
  requireWorkspace(workspace);
  const q = options.q?.trim();
  const listFilter = workspaceRecordListFilter(options);
  const where: Prisma.OfficeWorkspaceRecordWhereInput = {
    businessId: ctx.business.id,
    workspace,
    archivedAt: listFilter.archivedAt,
    ...("status" in listFilter ? { status: listFilter.status } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const records = await db.officeWorkspaceRecord.findMany({
    where,
    include: recordPeople,
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { updatedAt: "desc" }],
    take: Math.min(Math.max(options.limit ?? 100, 1), 200),
  });
  return records.map(serializeRecord);
}

async function validateAssignee(ctx: AuthContext, assignedToId?: string | null) {
  if (!assignedToId) return;
  const employee = await db.employeeProfile.findFirst({
    where: { id: assignedToId, businessId: ctx.business.id, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  if (!employee) throw new Error("Assigned employee not found");
}

export async function createOfficeWorkspaceRecord(
  ctx: AuthContext,
  workspace: string,
  payload: unknown,
  ipAddress?: string
) {
  requirePermission(ctx, PERMISSIONS.CREATE_DOCUMENTS);
  requireWorkspace(workspace);
  const input = officeWorkspaceRecordCreateSchema.parse(payload);
  await validateAssignee(ctx, input.assignedToId);
  const record = await db.$transaction(async (tx) => {
    const created = await tx.officeWorkspaceRecord.create({
      data: {
        businessId: ctx.business.id,
        workspace,
        createdById: ctx.employee.id,
        assignedToId: input.assignedToId,
        title: input.title,
        summary: input.summary,
        status: input.status,
        priority: input.priority,
        dueAt: input.dueAt,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      include: recordPeople,
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        action: "WORKSPACE_RECORD_CREATE",
        details: { recordId: created.id, workspace, title: created.title },
        ipAddress,
      },
    });
    return created;
  });
  return serializeRecord(record);
}

export async function updateOfficeWorkspaceRecord(
  ctx: AuthContext,
  workspace: string,
  id: string,
  payload: unknown,
  ipAddress?: string
) {
  requireWorkspace(workspace);
  const input = officeWorkspaceRecordUpdateSchema.parse(payload);
  await validateAssignee(ctx, input.assignedToId);
  const current = await db.officeWorkspaceRecord.findFirst({
    where: { id, workspace, businessId: ctx.business.id, archivedAt: null },
    select: { id: true, createdById: true },
  });
  if (!current) throw new Error("Workspace record not found");
  requireCreateOrEdit(ctx, current.createdById);
  const record = await db.$transaction(async (tx) => {
    const updated = await tx.officeWorkspaceRecord.update({
      where: { id },
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      include: recordPeople,
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        action: "WORKSPACE_RECORD_UPDATE",
        details: { recordId: id, workspace, changed: Object.keys(input) },
        ipAddress,
      },
    });
    return updated;
  });
  return serializeRecord(record);
}

export async function archiveOfficeWorkspaceRecord(
  ctx: AuthContext,
  workspace: string,
  id: string,
  ipAddress?: string
) {
  requirePermission(ctx, PERMISSIONS.DELETE_DOCUMENTS);
  requireWorkspace(workspace);
  const current = await db.officeWorkspaceRecord.findFirst({
    where: { id, workspace, businessId: ctx.business.id, archivedAt: null },
    select: { id: true, title: true },
  });
  if (!current) throw new Error("Workspace record not found");
  const archived = await db.$transaction(async (tx) => {
    const updated = await tx.officeWorkspaceRecord.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: recordPeople,
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        action: "WORKSPACE_RECORD_ARCHIVE",
        details: { recordId: id, workspace, title: current.title },
        ipAddress,
      },
    });
    return updated;
  });
  return serializeRecord(archived);
}

export async function restoreOfficeWorkspaceRecord(
  ctx: AuthContext,
  workspace: string,
  id: string,
  ipAddress?: string
) {
  requirePermission(ctx, PERMISSIONS.DELETE_DOCUMENTS);
  requireWorkspace(workspace);
  const current = await db.officeWorkspaceRecord.findFirst({
    where: { id, workspace, businessId: ctx.business.id, archivedAt: { not: null } },
    select: { id: true, title: true },
  });
  if (!current) throw new Error("Archived workspace record not found");
  const restored = await db.$transaction(async (tx) => {
    const updated = await tx.officeWorkspaceRecord.update({
      where: { id },
      data: { archivedAt: null },
      include: recordPeople,
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        action: "WORKSPACE_RECORD_RESTORE",
        details: { recordId: id, workspace, title: current.title },
        ipAddress,
      },
    });
    return updated;
  });
  return serializeRecord(restored);
}
