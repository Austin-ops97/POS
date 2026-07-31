import { z } from "zod";

export const OFFICE_DOCUMENT_KINDS = [
  "RICH_TEXT",
  "SCAN",
  "UPLOAD",
  "TEMPLATE",
] as const;

export const OFFICE_DOCUMENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export const officeDocumentCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  kind: z.enum(OFFICE_DOCUMENT_KINDS).default("RICH_TEXT"),
  folderId: z.string().cuid().nullable().optional(),
  locationId: z.string().cuid().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  content: z.string().max(500_000).default(""),
  isSensitive: z.boolean().default(false),
});

export const officeDocumentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(180).optional(),
    folderId: z.string().cuid().nullable().optional(),
    locationId: z.string().cuid().nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    content: z.string().max(500_000).optional(),
    status: z.enum(OFFICE_DOCUMENT_STATUSES).optional(),
    isSensitive: z.boolean().optional(),
    tagIds: z.array(z.string().cuid()).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const officeFolderCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().cuid().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color")
    .default("#64748b"),
});

export const officeVersionCreateSchema = z.object({
  note: z.string().trim().max(240).optional(),
});

export const officeFileOrderSchema = z.object({
  fileIds: z.array(z.string().cuid()).min(1).max(100),
});

export const officeTagCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color")
    .default("#64748b"),
});

export const officeListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  folderId: z.string().cuid().optional(),
  kind: z.enum(OFFICE_DOCUMENT_KINDS).optional(),
  status: z.enum(OFFICE_DOCUMENT_STATUSES).optional(),
  favorite: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

