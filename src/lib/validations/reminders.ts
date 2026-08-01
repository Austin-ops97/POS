import { z } from "zod";

export const REMINDER_RECURRENCES = ["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY"] as const;

export const reminderRecipientsSchema = z.object({
  includeOwner: z.boolean().default(true),
  includeAdmins: z.boolean().default(false),
  employeeIds: z.array(z.string().cuid()).max(50).default([]),
  emails: z.array(z.string().email()).max(20).default([]),
});

export type ReminderRecipientsInput = z.infer<typeof reminderRecipientsSchema>;

const reminderBaseFields = {
  title: z.string().trim().min(1, "Title is required").max(160),
  message: z.string().trim().max(5_000).optional().nullable(),
  timezone: z.string().trim().min(1).max(80).default("America/Chicago"),
  scheduledAt: z.coerce.date(),
  recurrence: z.enum(REMINDER_RECURRENCES).default("ONE_TIME"),
  intervalCount: z.coerce.number().int().min(1).max(365).default(1),
  sendBeforeMinutes: z.coerce.number().int().min(0).max(60 * 24 * 30).default(0),
  enabled: z.boolean().default(true),
  paused: z.boolean().default(false),
  stopAt: z.coerce.date().optional().nullable(),
  maxOccurrences: z.coerce.number().int().min(1).max(10_000).optional().nullable(),
  recipients: reminderRecipientsSchema.default({
    includeOwner: true,
    includeAdmins: false,
    employeeIds: [],
    emails: [],
  }),
};

export const reminderCreateSchema = z.object(reminderBaseFields).superRefine((value, ctx) => {
  const recipients = value.recipients;
  if (
    !recipients.includeOwner &&
    !recipients.includeAdmins &&
    recipients.employeeIds.length === 0 &&
    recipients.emails.length === 0
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Choose at least one recipient",
      path: ["recipients"],
    });
  }
});

export const reminderUpdateSchema = z
  .object({
    ...reminderBaseFields,
    enabled: z.boolean().optional(),
    paused: z.boolean().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const reminderTestSendSchema = z.object({
  to: z.string().email().optional(),
});

export const reminderListQuerySchema = z.object({
  view: z.enum(["upcoming", "sent", "failed"]).default("upcoming"),
  projectId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
