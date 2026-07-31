import { z } from "zod";

export const OFFICE_WORKSPACE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "NEEDS_REVIEW",
  "WAITING",
  "COMPLETE",
] as const;

export const OFFICE_WORKSPACE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const officeWorkspaceRecordFields = {
  title: z.string().trim().min(1, "A title is required").max(160),
  summary: z.string().trim().max(2_000).optional().nullable(),
  status: z.enum(OFFICE_WORKSPACE_STATUSES),
  priority: z.enum(OFFICE_WORKSPACE_PRIORITIES),
  dueAt: z.coerce.date().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

export const officeWorkspaceRecordCreateSchema = z.object({
  ...officeWorkspaceRecordFields,
  status: officeWorkspaceRecordFields.status.default("ACTIVE"),
  priority: officeWorkspaceRecordFields.priority.default("NORMAL"),
});

export const officeWorkspaceRecordUpdateSchema = z.object(officeWorkspaceRecordFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
