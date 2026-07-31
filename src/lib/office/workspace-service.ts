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
  createdBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
};

function requirePermission(ctx: AuthContext, permission: string) {
  if (!hasPermission(ctx, permission)) throw new Error(`Missing permission: ${permission}`);
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
  };
}

const recordPeople = {
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

export async function listOfficeWorkspaceRecords(
  ctx: AuthContext,
  workspace: string,
  options: { q?: string; limit?: number; includeComplete?: boolean } = {}
) {
  requirePermission(ctx, PERMISSIONS.VIEW_DOCUMENTS);
  requireWorkspace(workspace);
  const q = options.q?.trim();
  const where: Prisma.OfficeWorkspaceRecordWhereInput = {
    businessId: ctx.business.id,
    workspace,
    archivedAt: null,
    ...(options.includeComplete ? {} : { status: { not: "COMPLETE" } }),
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
  requirePermission(ctx, PERMISSIONS.EDIT_DOCUMENTS);
  requireWorkspace(workspace);
  const input = officeWorkspaceRecordUpdateSchema.parse(payload);
  await validateAssignee(ctx, input.assignedToId);
  const current = await db.officeWorkspaceRecord.findFirst({
    where: { id, workspace, businessId: ctx.business.id, archivedAt: null },
    select: { id: true },
  });
  if (!current) throw new Error("Workspace record not found");
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
  await db.$transaction([
    db.officeWorkspaceRecord.update({ where: { id }, data: { archivedAt: new Date() } }),
    db.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        action: "WORKSPACE_RECORD_ARCHIVE",
        details: { recordId: id, workspace, title: current.title },
        ipAddress,
      },
    }),
  ]);
}
