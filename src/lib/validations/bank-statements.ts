import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));

export const bankStatementCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  accountName: z.string().trim().max(120).optional().or(z.literal("")),
  periodStart: isoDate,
  periodEnd: isoDate,
  notes: z.string().trim().max(2_000).optional().or(z.literal("")),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().min(1),
  storageUrl: z.string().min(1),
});
