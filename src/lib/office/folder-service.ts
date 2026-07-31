import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { officeFolderCreateSchema, officeTagCreateSchema } from "@/lib/validations/office";

export async function listOfficeFolders(ctx: AuthContext) {
  if (!hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_DOCUMENTS}`);
  }
  return db.officeFolder.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      name: true,
      color: true,
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
    orderBy: [{ name: "asc" }],
  });
}

export async function createOfficeFolder(ctx: AuthContext, data: unknown) {
  if (!hasPermission(ctx, PERMISSIONS.MANAGE_DOCUMENT_FOLDERS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_DOCUMENT_FOLDERS}`);
  }
  const input = officeFolderCreateSchema.parse(data);
  if (input.parentId) {
    const parent = await db.officeFolder.findFirst({
      where: { id: input.parentId, businessId: ctx.business.id, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new Error("Office folder not found");
  }
  return db.officeFolder.create({
    data: {
      businessId: ctx.business.id,
      createdById: ctx.employee.id,
      name: input.name,
      parentId: input.parentId,
      color: input.color,
    },
  });
}

export async function listOfficeTags(ctx: AuthContext) {
  if (!hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_DOCUMENTS}`);
  }
  return db.officeTag.findMany({
    where: { businessId: ctx.business.id },
    orderBy: { name: "asc" },
  });
}

export async function createOfficeTag(ctx: AuthContext, data: unknown) {
  if (!hasPermission(ctx, PERMISSIONS.MANAGE_DOCUMENT_FOLDERS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_DOCUMENT_FOLDERS}`);
  }
  const input = officeTagCreateSchema.parse(data);
  return db.officeTag.upsert({
    where: { businessId_name: { businessId: ctx.business.id, name: input.name } },
    create: { businessId: ctx.business.id, name: input.name, color: input.color },
    update: { color: input.color },
  });
}

