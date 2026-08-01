import { randomUUID } from "crypto";
import type { Prisma, ReminderRecurrence } from "@prisma/client";
import { Resend } from "resend";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { requireModule } from "@/lib/access-control";
import {
  advanceReminderSchedule,
  applySendBefore,
  computeNextSendAt,
} from "@/lib/office/reminder-schedule";
import {
  reminderCreateSchema,
  reminderRecipientsSchema,
  reminderUpdateSchema,
  type ReminderRecipientsInput,
} from "@/lib/validations/reminders";

export { computeNextSendAt };

const CLAIM_STALE_MS = 15 * 60_000;
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);

function requireRemindersPermission(ctx: AuthContext) {
  if (!hasPermission(ctx, PERMISSIONS.MANAGE_PROJECT_REMINDERS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PROJECT_REMINDERS}`);
  }
}

async function assertRemindersEnabled(businessId: string) {
  const [moduleOk, settings] = await Promise.all([
    db.moduleSetting.findUnique({
      where: { businessId_module: { businessId, module: "PROJECT_REMINDERS" } },
      select: { enabled: true },
    }),
    db.businessSetting.findUnique({
      where: { businessId },
      select: { enableProjectReminders: true },
    }),
  ]);
  if (moduleOk?.enabled === false) throw new Error("Module disabled: PROJECT_REMINDERS");
  if (settings && !settings.enableProjectReminders) {
    throw new Error("Project reminders are disabled for this business");
  }
}

async function getProjectOrThrow(businessId: string, projectId: string) {
  const project = await db.officeWorkspaceRecord.findFirst({
    where: {
      id: projectId,
      businessId,
      workspace: "projects",
      archivedAt: null,
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

function parseRecipients(value: Prisma.JsonValue): ReminderRecipientsInput {
  return reminderRecipientsSchema.parse(value ?? {});
}

export type ResolvedRecipient = {
  email: string;
  name: string | null;
  employeeId: string | null;
};

export async function resolveReminderRecipients(
  businessId: string,
  projectId: string,
  recipientsInput: ReminderRecipientsInput
): Promise<ResolvedRecipient[]> {
  const project = await getProjectOrThrow(businessId, projectId);
  const byEmail = new Map<string, ResolvedRecipient>();

  const add = (email: string | null | undefined, name: string | null, employeeId: string | null) => {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) return;
    if (!byEmail.has(normalized)) {
      byEmail.set(normalized, { email: normalized, name, employeeId });
    }
  };

  if (recipientsInput.includeOwner && project.assignedTo) {
    add(project.assignedTo.email, project.assignedTo.name, project.assignedTo.id);
  }

  if (recipientsInput.includeAdmins) {
    const admins = await db.employeeProfile.findMany({
      where: {
        businessId,
        status: "ACTIVE",
        deletedAt: null,
        role: { name: { in: ["Owner", "Admin"] } },
      },
      select: { id: true, name: true, email: true },
    });
    for (const admin of admins) add(admin.email, admin.name, admin.id);
  }

  if (recipientsInput.employeeIds.length) {
    const employees = await db.employeeProfile.findMany({
      where: {
        businessId,
        id: { in: recipientsInput.employeeIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true, name: true, email: true },
    });
    for (const employee of employees) add(employee.email, employee.name, employee.id);
  }

  for (const email of recipientsInput.emails) {
    add(email, null, null);
  }

  return [...byEmail.values()];
}

function serializeReminder(reminder: {
  id: string;
  businessId: string;
  projectId: string;
  createdById: string;
  title: string;
  message: string | null;
  timezone: string;
  scheduledAt: Date;
  nextSendAt: Date;
  lastSentAt: Date | null;
  recurrence: ReminderRecurrence;
  intervalCount: number;
  sendBeforeMinutes: number;
  enabled: boolean;
  paused: boolean;
  stopAt: Date | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  recipients: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  project?: { id: string; title: string; status: string };
  createdBy?: { id: string; name: string };
  deliveries?: Array<{
    id: string;
    status: string;
    recipientEmail: string;
    sentAt: Date | null;
    failedAt: Date | null;
    failureMessage: string | null;
    occurrenceAt: Date;
    createdAt: Date;
  }>;
}) {
  return {
    id: reminder.id,
    businessId: reminder.businessId,
    projectId: reminder.projectId,
    createdById: reminder.createdById,
    title: reminder.title,
    message: reminder.message,
    timezone: reminder.timezone,
    scheduledAt: reminder.scheduledAt.toISOString(),
    nextSendAt: reminder.nextSendAt.toISOString(),
    lastSentAt: reminder.lastSentAt?.toISOString() ?? null,
    recurrence: reminder.recurrence,
    intervalCount: reminder.intervalCount,
    sendBeforeMinutes: reminder.sendBeforeMinutes,
    enabled: reminder.enabled,
    paused: reminder.paused,
    stopAt: reminder.stopAt?.toISOString() ?? null,
    maxOccurrences: reminder.maxOccurrences,
    occurrenceCount: reminder.occurrenceCount,
    recipients: parseRecipients(reminder.recipients),
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
    project: reminder.project ?? undefined,
    createdBy: reminder.createdBy ?? undefined,
    deliveries: reminder.deliveries?.map((d) => ({
      id: d.id,
      status: d.status,
      recipientEmail: d.recipientEmail,
      sentAt: d.sentAt?.toISOString() ?? null,
      failedAt: d.failedAt?.toISOString() ?? null,
      failureMessage: d.failureMessage,
      occurrenceAt: d.occurrenceAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

export async function listProjectReminders(ctx: AuthContext, projectId: string) {
  requireRemindersPermission(ctx);
  await requireModule(ctx, "PROJECT_REMINDERS");
  await assertRemindersEnabled(ctx.business.id);
  await getProjectOrThrow(ctx.business.id, projectId);

  const reminders = await db.projectReminder.findMany({
    where: { businessId: ctx.business.id, projectId, deletedAt: null },
    include: {
      createdBy: { select: { id: true, name: true } },
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
    orderBy: [{ nextSendAt: "asc" }, { createdAt: "desc" }],
  });
  return reminders.map(serializeReminder);
}

export async function listBusinessReminders(
  ctx: AuthContext,
  options: { view?: "upcoming" | "sent" | "failed"; projectId?: string; limit?: number } = {}
) {
  requireRemindersPermission(ctx);
  await requireModule(ctx, "PROJECT_REMINDERS");
  await assertRemindersEnabled(ctx.business.id);

  const view = options.view ?? "upcoming";
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const projectFilter = options.projectId ? { projectId: options.projectId } : {};

  if (view === "upcoming") {
    const reminders = await db.projectReminder.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        enabled: true,
        paused: false,
        ...projectFilter,
      },
      include: {
        project: { select: { id: true, title: true, status: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { nextSendAt: "asc" },
      take: limit,
    });
    return { view, reminders: reminders.map(serializeReminder) };
  }

  const deliveries = await db.reminderDelivery.findMany({
    where: {
      businessId: ctx.business.id,
      status: view === "sent" ? "SENT" : "FAILED",
      ...(options.projectId
        ? { reminder: { projectId: options.projectId, deletedAt: null } }
        : { reminder: { deletedAt: null } }),
    },
    include: {
      reminder: {
        include: {
          project: { select: { id: true, title: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    view,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      status: d.status,
      recipientEmail: d.recipientEmail,
      recipientName: d.recipientName,
      sentAt: d.sentAt?.toISOString() ?? null,
      failedAt: d.failedAt?.toISOString() ?? null,
      failureMessage: d.failureMessage,
      occurrenceAt: d.occurrenceAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
      reminder: {
        id: d.reminder.id,
        title: d.reminder.title,
        projectId: d.reminder.projectId,
        project: d.reminder.project,
      },
    })),
  };
}

export async function createReminder(
  ctx: AuthContext,
  projectId: string,
  raw: unknown
) {
  requireRemindersPermission(ctx);
  await requireModule(ctx, "PROJECT_REMINDERS");
  await assertRemindersEnabled(ctx.business.id);
  await getProjectOrThrow(ctx.business.id, projectId);

  const input = reminderCreateSchema.parse(raw);
  const nextSendAt = applySendBefore(input.scheduledAt, input.sendBeforeMinutes);

  const reminder = await db.projectReminder.create({
    data: {
      businessId: ctx.business.id,
      projectId,
      createdById: ctx.employee.id,
      title: input.title,
      message: input.message ?? null,
      timezone: input.timezone,
      scheduledAt: input.scheduledAt,
      nextSendAt,
      recurrence: input.recurrence,
      intervalCount: input.intervalCount,
      sendBeforeMinutes: input.sendBeforeMinutes,
      enabled: input.enabled,
      paused: input.paused,
      stopAt: input.stopAt ?? null,
      maxOccurrences: input.maxOccurrences ?? null,
      recipients: input.recipients,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });
  return serializeReminder(reminder);
}

export async function updateReminder(ctx: AuthContext, id: string, raw: unknown) {
  requireRemindersPermission(ctx);
  await requireModule(ctx, "PROJECT_REMINDERS");
  await assertRemindersEnabled(ctx.business.id);

  const existing = await db.projectReminder.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
  });
  if (!existing) throw new Error("Reminder not found");

  const input = reminderUpdateSchema.parse(raw);
  const scheduledAt = input.scheduledAt ?? existing.scheduledAt;
  const sendBeforeMinutes = input.sendBeforeMinutes ?? existing.sendBeforeMinutes;
  const shouldRecompute =
    input.scheduledAt != null || input.sendBeforeMinutes != null || input.recurrence != null;

  const reminder = await db.projectReminder.update({
    where: { id: existing.id },
    data: {
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.timezone != null ? { timezone: input.timezone } : {}),
      ...(input.scheduledAt != null ? { scheduledAt: input.scheduledAt } : {}),
      ...(input.recurrence != null ? { recurrence: input.recurrence } : {}),
      ...(input.intervalCount != null ? { intervalCount: input.intervalCount } : {}),
      ...(input.sendBeforeMinutes != null ? { sendBeforeMinutes: input.sendBeforeMinutes } : {}),
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      ...(input.paused != null ? { paused: input.paused } : {}),
      ...(input.stopAt !== undefined ? { stopAt: input.stopAt } : {}),
      ...(input.maxOccurrences !== undefined ? { maxOccurrences: input.maxOccurrences } : {}),
      ...(input.recipients != null ? { recipients: input.recipients } : {}),
      ...(shouldRecompute && existing.occurrenceCount === 0
        ? { nextSendAt: applySendBefore(scheduledAt, sendBeforeMinutes) }
        : {}),
      claimToken: null,
      claimedAt: null,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      project: { select: { id: true, title: true, status: true } },
    },
  });
  return serializeReminder(reminder);
}

export async function deleteReminder(ctx: AuthContext, id: string) {
  requireRemindersPermission(ctx);
  await requireModule(ctx, "PROJECT_REMINDERS");

  const existing = await db.projectReminder.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Reminder not found");

  await db.projectReminder.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), enabled: false, claimToken: null, claimedAt: null },
  });
  return { success: true };
}

export async function sendReminderEmail(input: {
  to: string;
  subject: string;
  body: string;
  recipientName?: string | null;
}): Promise<{ messageId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.OFFICE_FROM_EMAIL?.trim() || process.env.RECEIPTS_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error("Email sending is not configured. Set RESEND_API_KEY and OFFICE_FROM_EMAIL.");
  }

  const greeting = input.recipientName ? `Hi ${input.recipientName},\n\n` : "";
  const text = `${greeting}${input.body}`;
  const result = await new Resend(apiKey).emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text,
    html: `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.6">${escapeHtml(text)}</div>`,
  });
  if (result.error) throw new Error(result.error.message);
  return { messageId: result.data?.id ?? null };
}

export async function claimDueReminders(now = new Date(), limit = 20) {
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  const due = await db.projectReminder.findMany({
    where: {
      enabled: true,
      paused: false,
      deletedAt: null,
      nextSendAt: { lte: now },
      OR: [{ claimToken: null }, { claimedAt: { lt: staleBefore } }],
    },
    orderBy: { nextSendAt: "asc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true },
  });

  const claimed: Array<{ id: string; claimToken: string }> = [];
  for (const row of due) {
    const claimToken = randomUUID();
    const result = await db.projectReminder.updateMany({
      where: {
        id: row.id,
        enabled: true,
        paused: false,
        deletedAt: null,
        nextSendAt: { lte: now },
        OR: [{ claimToken: null }, { claimedAt: { lt: staleBefore } }],
      },
      data: { claimToken, claimedAt: now },
    });
    if (result.count === 1) claimed.push({ id: row.id, claimToken });
  }
  return claimed;
}

export async function processReminder(reminderId: string, claimToken: string) {
  const reminder = await db.projectReminder.findFirst({
    where: { id: reminderId, claimToken, deletedAt: null },
    include: {
      project: { select: { id: true, title: true, status: true, businessId: true } },
      business: { select: { id: true, name: true } },
    },
  });
  if (!reminder) return { ok: false as const, reason: "claim_mismatch" as const };

  const occurrenceAt = reminder.nextSendAt;
  const recipients = await resolveReminderRecipients(
    reminder.businessId,
    reminder.projectId,
    parseRecipients(reminder.recipients)
  );

  const subject = `[Reminder] ${reminder.title}`;
  const bodyLines = [
    reminder.message?.trim() || `This is a reminder for project "${reminder.project.title}".`,
    "",
    `Project: ${reminder.project.title}`,
    `Business: ${reminder.business.name}`,
  ];
  const body = bodyLines.join("\n");

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    try {
      await db.reminderDelivery.create({
        data: {
          businessId: reminder.businessId,
          reminderId: reminder.id,
          occurrenceAt,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          employeeId: recipient.employeeId,
          status: "PENDING",
          attemptCount: 1,
        },
      });
    } catch (error) {
      // Unique (reminderId, occurrenceAt, recipientEmail) — already delivered
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }

    try {
      const { messageId } = await sendReminderEmail({
        to: recipient.email,
        subject,
        body,
        recipientName: recipient.name,
      });
      await db.reminderDelivery.updateMany({
        where: {
          reminderId: reminder.id,
          occurrenceAt,
          recipientEmail: recipient.email,
        },
        data: {
          status: "SENT",
          providerMessageId: messageId,
          sentAt: new Date(),
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      await db.reminderDelivery.updateMany({
        where: {
          reminderId: reminder.id,
          occurrenceAt,
          recipientEmail: recipient.email,
        },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureMessage: message.slice(0, 500),
        },
      });
      failed += 1;
    }
  }

  const nextOccurrenceCount = reminder.occurrenceCount + 1;
  const nextSendAt = advanceReminderSchedule({
    recurrence: reminder.recurrence,
    occurrenceAt,
    intervalCount: reminder.intervalCount,
    timezone: reminder.timezone,
    occurrenceCount: reminder.occurrenceCount,
    maxOccurrences: reminder.maxOccurrences,
    stopAt: reminder.stopAt,
  });

  await db.projectReminder.update({
    where: { id: reminder.id },
    data: {
      lastSentAt: new Date(),
      occurrenceCount: nextOccurrenceCount,
      nextSendAt: nextSendAt ?? occurrenceAt,
      enabled: nextSendAt != null,
      claimToken: null,
      claimedAt: null,
    },
  });

  return { ok: true as const, sent, failed, skipped, completed: nextSendAt == null };
}

export async function testSendReminder(ctx: AuthContext, id: string, to?: string) {
  requireRemindersPermission(ctx);
  await requireModule(ctx, "PROJECT_REMINDERS");
  await assertRemindersEnabled(ctx.business.id);

  const reminder = await db.projectReminder.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
    include: {
      project: { select: { title: true } },
      business: { select: { name: true } },
    },
  });
  if (!reminder) throw new Error("Reminder not found");

  const target =
    to?.trim().toLowerCase() ||
    ctx.employee.email.trim().toLowerCase();

  await sendReminderEmail({
    to: target,
    subject: `[Test] ${reminder.title}`,
    body: [
      reminder.message?.trim() || `Test reminder for project "${reminder.project.title}".`,
      "",
      `Project: ${reminder.project.title}`,
      `Business: ${reminder.business.name}`,
      "",
      "(This is a test send — it was not recorded as a delivery.)",
    ].join("\n"),
    recipientName: ctx.employee.name,
  });

  return { success: true, to: target };
}

export async function resendReminder(ctx: AuthContext, id: string) {
  requireRemindersPermission(ctx);
  await requireModule(ctx, "PROJECT_REMINDERS");
  await assertRemindersEnabled(ctx.business.id);

  const reminder = await db.projectReminder.findFirst({
    where: { id, businessId: ctx.business.id, deletedAt: null },
  });
  if (!reminder) throw new Error("Reminder not found");

  const claimToken = randomUUID();
  await db.projectReminder.update({
    where: { id: reminder.id },
    data: {
      claimToken,
      claimedAt: new Date(),
      // Use a unique occurrence for manual resend to avoid unique constraint collisions
      nextSendAt: new Date(),
      enabled: true,
      paused: false,
    },
  });

  return processReminder(reminder.id, claimToken);
}
