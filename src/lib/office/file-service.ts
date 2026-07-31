import { createHash } from "crypto";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { officeFileOrderSchema } from "@/lib/validations/office";

export const MAX_OFFICE_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function cleanFileName(fileName: string) {
  return fileName.replace(/[^a-z0-9._() -]/gi, "_").slice(0, 180) || "document";
}

function matchesSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  }
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/webp") {
    return Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
  }
  if (mimeType.includes("wordprocessingml")) {
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
  }
  return true;
}

async function requireDocumentForFile(
  ctx: AuthContext,
  documentId: string
) {
  const document = await db.officeDocument.findFirst({
    where: { id: documentId, businessId: ctx.business.id, deletedAt: null },
    select: { id: true, isSensitive: true, kind: true, status: true, createdById: true },
  });
  if (!document) throw new Error("Office document not found");
  if (
    document.isSensitive &&
    !hasPermission(ctx, PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS)
  ) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS}`);
  }
  return document;
}

export async function uploadOfficeFile(
  ctx: AuthContext,
  documentId: string,
  file: File,
  metadata: { sortOrder?: number; width?: number; height?: number } = {},
  ipAddress?: string
) {
  const document = await requireDocumentForFile(ctx, documentId);
  if (document.kind === "SCAN") {
    if (!hasPermission(ctx, PERMISSIONS.SCAN_DOCUMENTS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.SCAN_DOCUMENTS}`);
    }
    if (
      document.createdById !== ctx.employee.id &&
      !hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
    }
  } else if (
    !hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS) &&
    !(
      document.createdById === ctx.employee.id &&
      document.status === "DRAFT" &&
      hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS)
    )
  ) {
    throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
  }
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Unsupported office file type");
  if (file.size <= 0 || file.size > MAX_OFFICE_FILE_BYTES) {
    throw new Error("Office file exceeds the 10 MB limit");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(file.type, bytes)) throw new Error("Office file content does not match its type");
  const checksum = createHash("sha256").update(bytes).digest("hex");

  const duplicate = await db.officeDocumentFile.findFirst({
    where: { documentId, checksum, deletedAt: null },
    select: { id: true },
  });
  if (duplicate) throw new Error("This file is already attached to the document");

  const maxOrder = await db.officeDocumentFile.aggregate({
    where: { documentId, deletedAt: null },
    _max: { sortOrder: true },
  });
  const created = await db.$transaction(async (tx) => {
    const result = await tx.officeDocumentFile.create({
      data: {
        documentId,
        uploadedById: ctx.employee.id,
        data: Buffer.from(bytes),
        fileName: cleanFileName(file.name),
        mimeType: file.type,
        sizeBytes: file.size,
        checksum,
        sortOrder: metadata.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
        width: metadata.width,
        height: metadata.height,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        sortOrder: true,
        width: true,
        height: true,
      },
    });
    await tx.officeAuditEvent.create({
      data: {
        businessId: ctx.business.id,
        actorId: ctx.employee.id,
        documentId,
        action: "FILE_UPLOADED",
        details: { fileName: result.fileName, sizeBytes: result.sizeBytes },
        ipAddress,
      },
    });
    return result;
  });
  return created;
}

export async function readOfficeFile(ctx: AuthContext, fileId: string) {
  if (!hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_DOCUMENTS}`);
  }
  const file = await db.officeDocumentFile.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      document: { businessId: ctx.business.id, deletedAt: null },
    },
    include: { document: { select: { isSensitive: true, createdById: true } } },
  });
  if (!file) throw new Error("Office file not found");
  if (
    file.document.isSensitive &&
    file.document.createdById !== ctx.employee.id &&
    !hasPermission(ctx, PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS)
  ) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS}`);
  }
  if (!file.data) throw new Error("Office file data is unavailable");
  return file;
}

export async function reorderOfficeFiles(
  ctx: AuthContext,
  documentId: string,
  data: unknown
) {
  const document = await requireDocumentForFile(ctx, documentId);
  if (
    !hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS) &&
    !(
      document.status === "DRAFT" &&
      document.createdById === ctx.employee.id &&
      ((document.kind === "SCAN" && hasPermission(ctx, PERMISSIONS.SCAN_DOCUMENTS)) ||
        hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS))
    )
  ) {
    throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
  }
  const input = officeFileOrderSchema.parse(data);
  const count = await db.officeDocumentFile.count({
    where: { documentId, id: { in: input.fileIds }, deletedAt: null },
  });
  if (count !== new Set(input.fileIds).size) throw new Error("One or more office files were not found");
  await db.$transaction(
    input.fileIds.map((id, sortOrder) =>
      db.officeDocumentFile.update({ where: { id }, data: { sortOrder } })
    )
  );
  return { reordered: input.fileIds.length };
}

export async function deleteOfficeFile(ctx: AuthContext, fileId: string) {
  if (!hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
  }
  const file = await db.officeDocumentFile.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      document: { businessId: ctx.business.id, deletedAt: null },
    },
    select: { id: true },
  });
  if (!file) throw new Error("Office file not found");
  return db.officeDocumentFile.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
}
