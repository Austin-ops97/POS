import type { Prisma } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import {
  officeDocumentCreateSchema,
  officeDocumentUpdateSchema,
  officeListQuerySchema,
  officeVersionCreateSchema,
} from "@/lib/validations/office";
import { sanitizeOfficeContent } from "./content";

function requireOfficePermission(ctx: AuthContext, permission: string) {
  if (!hasPermission(ctx, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

function sensitiveWhere(ctx: AuthContext) {
  if (hasPermission(ctx, PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS)) return {};
  return {
    OR: [{ isSensitive: false }, { createdById: ctx.employee.id }],
  };
}

async function validateReferences(
  ctx: AuthContext,
  input: { folderId?: string | null; locationId?: string | null; tagIds?: string[] }
) {
  const [folder, location, tagCount] = await Promise.all([
    input.folderId
      ? db.officeFolder.findFirst({
          where: { id: input.folderId, businessId: ctx.business.id, deletedAt: null },
          select: { id: true },
        })
      : null,
    input.locationId
      ? db.location.findFirst({
          where: { id: input.locationId, businessId: ctx.business.id, deletedAt: null },
          select: { id: true },
        })
      : null,
    input.tagIds?.length
      ? db.officeTag.count({
          where: { businessId: ctx.business.id, id: { in: input.tagIds } },
        })
      : 0,
  ]);

  if (input.folderId && !folder) throw new Error("Office folder not found");
  if (input.locationId && !location) throw new Error("Location not found");
  if (input.tagIds && tagCount !== new Set(input.tagIds).size) {
    throw new Error("One or more document tags were not found");
  }
}

const documentSummaryInclude = {
  folder: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  files: {
    where: { deletedAt: null },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      sortOrder: true,
      width: true,
      height: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
  favorites: { select: { employeeId: true } },
} as const;

export async function listOfficeDocuments(
  ctx: AuthContext,
  query: Record<string, string | undefined> = {}
) {
  requireOfficePermission(ctx, PERMISSIONS.VIEW_DOCUMENTS);
  const input = officeListQuerySchema.parse(query);
  const accessConstraint = sensitiveWhere(ctx);
  const searchConstraint: Prisma.OfficeDocumentWhereInput = input.q
    ? {
        OR: [
          { title: { contains: input.q, mode: "insensitive" } },
          { description: { contains: input.q, mode: "insensitive" } },
          { content: { contains: input.q, mode: "insensitive" } },
          { tags: { some: { tag: { name: { contains: input.q, mode: "insensitive" } } } } },
        ],
      }
    : {};
  const where: Prisma.OfficeDocumentWhereInput = {
    businessId: ctx.business.id,
    deletedAt: null,
    AND: [accessConstraint, searchConstraint],
    ...(input.folderId ? { folderId: input.folderId } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.favorite === "true"
      ? { favorites: { some: { employeeId: ctx.employee.id } } }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.officeDocument.findMany({
      where,
      include: documentSummaryInclude,
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    db.officeDocument.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      isFavorite: item.favorites.some((favorite) => favorite.employeeId === ctx.employee.id),
      favorites: undefined,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
    pages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export async function getOfficeDocument(ctx: AuthContext, documentId: string) {
  requireOfficePermission(ctx, PERMISSIONS.VIEW_DOCUMENTS);
  const document = await db.officeDocument.findFirst({
    where: {
      id: documentId,
      businessId: ctx.business.id,
      deletedAt: null,
      ...sensitiveWhere(ctx),
    },
    include: {
      ...documentSummaryInclude,
      versions: {
        select: { id: true, version: true, note: true, createdAt: true, author: { select: { name: true } } },
        orderBy: { version: "desc" },
        take: 25,
      },
    },
  });
  if (!document) throw new Error("Office document not found");
  return {
    ...document,
    isFavorite: document.favorites.some((favorite) => favorite.employeeId === ctx.employee.id),
    favorites: undefined,
  };
}

export async function createOfficeDocument(
  ctx: AuthContext,
  data: unknown,
  ipAddress?: string
) {
  requireOfficePermission(ctx, PERMISSIONS.CREATE_DOCUMENTS);
  const input = officeDocumentCreateSchema.parse(data);
  if (input.kind === "TEMPLATE") {
    requireOfficePermission(ctx, PERMISSIONS.MANAGE_DOCUMENT_TEMPLATES);
  }
  if (input.isSensitive) {
    requireOfficePermission(ctx, PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS);
  }
  await validateReferences(ctx, input);
  const content = sanitizeOfficeContent(input.content);

  return db.$transaction(async (tx) => {
    const document = await tx.officeDocument.create({
      data: {
        businessId: ctx.business.id,
        createdById: ctx.employee.id,
        updatedById: ctx.employee.id,
        title: input.title,
        kind: input.kind,
        folderId: input.folderId,
        locationId: input.locationId,
        description: input.description,
        isSensitive: input.isSensitive,
        content,
      },
    });
    await tx.officeDocumentVersion.create({
      data: {
        documentId: document.id,
        authorId: ctx.employee.id,
        version: 1,
        title: document.title,
        content: document.content,
        note: "Document created",
      },
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        documentId: document.id,
        action: "DOCUMENT_CREATED",
        details: { kind: document.kind, title: document.title },
        ipAddress,
      },
    });
    return document;
  });
}

export async function updateOfficeDocument(
  ctx: AuthContext,
  documentId: string,
  data: unknown,
  ipAddress?: string
) {
  const input = officeDocumentUpdateSchema.parse(data);
  const current = await db.officeDocument.findFirst({
    where: { id: documentId, businessId: ctx.business.id, deletedAt: null },
  });
  if (!current) throw new Error("Office document not found");
  const canEdit =
    hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS) ||
    (current.createdById === ctx.employee.id &&
      current.status === "DRAFT" &&
      hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS));
  if (!canEdit) throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
  if (current.kind === "TEMPLATE") {
    requireOfficePermission(ctx, PERMISSIONS.MANAGE_DOCUMENT_TEMPLATES);
  }
  if (input.status === "PUBLISHED") {
    requireOfficePermission(ctx, PERMISSIONS.APPROVE_DOCUMENTS);
  }
  if ((current.isSensitive || input.isSensitive) && !hasPermission(ctx, PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS}`);
  }
  await validateReferences(ctx, input);

  const { tagIds, ...changes } = input;
  const now = new Date();
  return db.$transaction(async (tx) => {
    const document = await tx.officeDocument.update({
      where: { id: current.id },
      data: {
        ...changes,
        ...(changes.content !== undefined
          ? { content: sanitizeOfficeContent(changes.content) }
          : {}),
        ...(changes.status === "PUBLISHED" && current.status !== "PUBLISHED"
          ? { publishedAt: now, archivedAt: null }
          : {}),
        ...(changes.status === "ARCHIVED" ? { archivedAt: now } : {}),
        ...(changes.status === "DRAFT" ? { archivedAt: null } : {}),
        updatedById: ctx.employee.id,
        ...(tagIds
          ? {
              tags: {
                deleteMany: {},
                create: [...new Set(tagIds)].map((tagId) => ({ tagId })),
              },
            }
          : {}),
      },
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        documentId: document.id,
        action: "DOCUMENT_UPDATED",
        details: { fields: Object.keys(input) },
        ipAddress,
      },
    });
    return document;
  });
}

export async function createOfficeDocumentVersion(
  ctx: AuthContext,
  documentId: string,
  data: unknown,
  ipAddress?: string
) {
  const input = officeVersionCreateSchema.parse(data);
  const document = await db.officeDocument.findFirst({
    where: { id: documentId, businessId: ctx.business.id, deletedAt: null },
  });
  if (!document) throw new Error("Office document not found");
  const canEdit =
    hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS) ||
    (document.createdById === ctx.employee.id &&
      document.status === "DRAFT" &&
      hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS));
  if (!canEdit) throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
  const latest = await db.officeDocumentVersion.aggregate({
    where: { documentId },
    _max: { version: true },
  });
  const version = (latest._max.version ?? 0) + 1;
  return db.$transaction(async (tx) => {
    const created = await tx.officeDocumentVersion.create({
      data: {
        documentId,
        authorId: ctx.employee.id,
        version,
        title: document.title,
        content: document.content,
        note: input.note,
      },
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        documentId,
        action: "VERSION_CREATED",
        details: { version, note: input.note },
        ipAddress,
      },
    });
    return created;
  });
}

export async function deleteOfficeDocument(
  ctx: AuthContext,
  documentId: string,
  ipAddress?: string
) {
  requireOfficePermission(ctx, PERMISSIONS.DELETE_DOCUMENTS);
  const current = await db.officeDocument.findFirst({
    where: { id: documentId, businessId: ctx.business.id, deletedAt: null },
    select: { id: true, title: true },
  });
  if (!current) throw new Error("Office document not found");
  const now = new Date();
  return db.$transaction([
    db.officeDocument.update({ where: { id: current.id }, data: { deletedAt: now } }),
    db.officeDocumentFile.updateMany({ where: { documentId, deletedAt: null }, data: { deletedAt: now } }),
    db.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        documentId,
        action: "DOCUMENT_DELETED",
        details: { title: current.title },
        ipAddress,
      },
    }),
  ]);
}

export async function setOfficeFavorite(
  ctx: AuthContext,
  documentId: string,
  favorite: boolean
) {
  requireOfficePermission(ctx, PERMISSIONS.VIEW_DOCUMENTS);
  const document = await db.officeDocument.findFirst({
    where: { id: documentId, businessId: ctx.business.id, deletedAt: null, ...sensitiveWhere(ctx) },
    select: { id: true },
  });
  if (!document) throw new Error("Office document not found");
  if (favorite) {
    return db.officeDocumentFavorite.upsert({
      where: { documentId_employeeId: { documentId, employeeId: ctx.employee.id } },
      create: { documentId, employeeId: ctx.employee.id },
      update: {},
    });
  }
  await db.officeDocumentFavorite.deleteMany({
    where: { documentId, employeeId: ctx.employee.id },
  });
  return { favorite: false };
}
