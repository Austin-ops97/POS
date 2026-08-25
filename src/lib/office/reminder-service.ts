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
import { createAuditLog } from "@/lib/audit";
import {
  APP_NOTIFICATION_TYPE_REMINDER,
  normalizeRecipientEmail,
  planRecipientChannels,
  reminderRecipientDedupeKey,
  shouldAdvanceSchedule,
  shouldRetryEmail,
  type AlertRecipient,
} from "@/lib/office/reminder-alerts";

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

async function getProjectOrThrow(
  businessId: string,
  projectId: string,
  options: { includeArchived?: boolean } = {}
) {
  const project = await db.officeWorkspaceRecord.findFirst({
    where: {
      id: projectId,
      businessId,
      workspace: "projects",
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
          emailRemindersEnabled: true,
          inAppRemindersEnabled: true,
        },
      },
    },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

function parseRecipients(value: Prisma.JsonValue): ReminderRecipientsInput {
  return reminderRecipientsSchema.parse(value ?? {});
}

export type ResolvedRecipient = AlertRecipient;

export async function resolveReminderRecipients(
  businessId: string,
  projectId: string,
  recipientsInput: ReminderRecipientsInput
): Promise<ResolvedRecipient[]> {
  const project = await getProjectOrThrow(businessId, projectId, { includeArchived: true });
  const byKey = new Map<string, ResolvedRecipient>();

  const add = (
    email: string | null | undefined,
    name: string | null,
    employeeId: string | null,
    prefs?: { emailRemindersEnabled?: boolean; inAppRemindersEnabled?: boolean }
  ) => {
    const normalized = normalizeRecipientEmail(email);
    if (!employeeId && !normalized) return;
    const recipient: ResolvedRecipient = {
      email: normalized,
      name,
      employeeId,
      emailRemindersEnabled: prefs?.emailRemindersEnabled ?? true,
      inAppRemindersEnabled: prefs?.inAppRemindersEnabled ?? true,
    };
    const key = reminderRecipientDedupeKey(recipient);
    if (!byKey.has(key)) byKey.set(key, recipient);
  };

  if (recipientsInput.includeOwner && project.assignedTo) {
    add(
      project.assignedTo.email,
      project.assignedTo.name,
      project.assignedTo.id,
      project.assignedTo
    );
  }

  if (recipientsInput.includeAdmins) {
    const admins = await db.employeeProfile.findMany({
      where: {
        businessId,
        status: "ACTIVE",
        deletedAt: null,
        role: { name: { in: ["Owner", "Admin"] } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        emailRemindersEnabled: true,
        inAppRemindersEnabled: true,
      },
    });
    for (const admin of admins) {
      add(admin.email, admin.name, admin.id, admin);
    }
  }

  if (recipientsInput.employeeIds.length) {
    const employees = await db.employeeProfile.findMany({
      where: {
        businessId,
        id: { in: recipientsInput.employeeIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        emailRemindersEnabled: true,
        inAppRemindersEnabled: true,
      },
    });
    for (const employee of employees) {
      add(employee.email, employee.name, employee.id, employee);
    }
  }

  for (const email of recipientsInput.emails) {
    add(email, null, null);
  }

  return [...byKey.values()];
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
    inAppStatus?: string | null;
    recipientEmail: string | null;
    sentAt: Date | null;
    failedAt: Date | null;
    failureMessage: string | null;
    emailSkipReason?: string | null;
    inAppSkipReason?: string | null;
    occurrenceAt: Date;
    createdAt: Date;
    attemptCount?: number;
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
      inAppStatus: d.inAppStatus ?? null,
      recipientEmail: d.recipientEmail,
      sentAt: d.sentAt?.toISOString() ?? null,
      failedAt: d.failedAt?.toISOString() ?? null,
      failureMessage: d.failureMessage,
      emailSkipReason: d.emailSkipReason ?? null,
      inAppSkipReason: d.inAppSkipReason ?? null,
      occurrenceAt: d.occurrenceAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
      attemptCount: d.attemptCount ?? 0,
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

  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "PROJECT_REMINDER",
    entity: "ProjectReminder",
    entityId: reminder.id,
    details: {
      projectId,
      title: reminder.title,
      scheduledAt: reminder.scheduledAt.toISOString(),
      timezone: reminder.timezone,
      recurrence: reminder.recurrence,
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
      deliveries: true,
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
  const href = `/office/apps/projects`;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let inApp = 0;
  let retryableFailure = false;

  const existingByKey = new Map(
    reminder.deliveries
      .filter((d) => d.occurrenceAt.getTime() === occurrenceAt.getTime())
      .map((d) => [d.dedupeKey, d])
  );

  for (const recipient of recipients) {
    const dedupeKey = reminderRecipientDedupeKey(recipient);
    const plan = planRecipientChannels(recipient);
    const existing = existingByKey.get(dedupeKey) ?? null;

    if (
      existing &&
      (existing.status === "SENT" || existing.status === "SKIPPED") &&
      (existing.inAppStatus === "SENT" || existing.inAppStatus === "SKIPPED" || existing.inAppStatus == null)
    ) {
      skipped += 1;
      continue;
    }

    if (existing && !shouldRetryEmail(existing.status, existing.attemptCount) && existing.status === "FAILED") {
      skipped += 1;
      continue;
    }

    let delivery = existing;
    if (!delivery) {
      try {
        delivery = await db.reminderDelivery.create({
          data: {
            businessId: reminder.businessId,
            reminderId: reminder.id,
            occurrenceAt,
            dedupeKey,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            employeeId: recipient.employeeId,
            status: plan.sendEmail ? "PENDING" : "SKIPPED",
            emailSkipReason: plan.emailSkipReason,
            inAppSkipReason: plan.inAppSkipReason,
            inAppStatus: plan.sendInApp ? "PENDING" : "SKIPPED",
            attemptCount: 0,
          },
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          delivery =
            (await db.reminderDelivery.findUnique({
              where: {
                reminderId_occurrenceAt_dedupeKey: {
                  reminderId: reminder.id,
                  occurrenceAt,
                  dedupeKey,
                },
              },
            })) ??
            existing;
        } else {
          throw error;
        }
      }
    }
    if (!delivery) continue;

    const now = new Date();
    let emailStatus = delivery.status;
    let emailSkipReason = plan.emailSkipReason;
    let failureMessage = delivery.failureMessage;
    let providerMessageId = delivery.providerMessageId;
    let sentAt = delivery.sentAt;
    let failedAt = delivery.failedAt;
    let attemptCount = delivery.attemptCount;

    if (plan.sendEmail && shouldRetryEmail(delivery.status, delivery.attemptCount)) {
      attemptCount += 1;
      try {
        const result = await sendReminderEmail({
          to: recipient.email!,
          subject,
          body,
          recipientName: recipient.name,
        });
        emailStatus = "SENT";
        providerMessageId = result.messageId;
        sentAt = now;
        failedAt = null;
        failureMessage = null;
        sent += 1;
      } catch (error) {
        emailStatus = "FAILED";
        failedAt = now;
        failureMessage = (error instanceof Error ? error.message : "Send failed").slice(0, 500);
        failed += 1;
        if (shouldRetryEmail("FAILED", attemptCount)) retryableFailure = true;
      }
    } else if (!plan.sendEmail) {
      emailStatus = "SKIPPED";
      emailSkipReason = plan.emailSkipReason;
      skipped += 1;
    } else if (delivery.status === "SENT" || delivery.status === "SKIPPED") {
      emailStatus = delivery.status;
    }

    let inAppStatus = delivery.inAppStatus ?? (plan.sendInApp ? "PENDING" : "SKIPPED");
    let inAppNotifiedAt = delivery.inAppNotifiedAt;
    let inAppSkipReason = plan.inAppSkipReason;

    if (plan.sendInApp && delivery.inAppStatus !== "SENT") {
      try {
        await db.appNotification.create({
          data: {
            businessId: reminder.businessId,
            employeeId: recipient.employeeId!,
            type: APP_NOTIFICATION_TYPE_REMINDER,
            title: reminder.title,
            body: reminder.message?.trim() || `Reminder for project "${reminder.project.title}".`,
            href,
            reminderId: reminder.id,
            deliveryId: delivery.id,
          },
        });
        inAppStatus = "SENT";
        inAppNotifiedAt = now;
        inApp += 1;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          inAppStatus = "SENT";
          inAppNotifiedAt = inAppNotifiedAt ?? now;
        } else {
          inAppStatus = "FAILED";
          inAppSkipReason = (error instanceof Error ? error.message : "In-app notify failed").slice(0, 200);
        }
      }
    } else if (!plan.sendInApp) {
      inAppStatus = "SKIPPED";
      inAppSkipReason = plan.inAppSkipReason;
    }

    await db.reminderDelivery.update({
      where: { id: delivery.id },
      data: {
        status: emailStatus,
        inAppStatus,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        employeeId: recipient.employeeId,
        providerMessageId,
        attemptCount,
        sentAt,
        failedAt,
        lastAttemptAt: now,
        failureMessage,
        emailSkipReason,
        inAppSkipReason,
        inAppNotifiedAt,
      },
    });
  }

  const nextSendAt = retryableFailure
    ? occurrenceAt
    : advanceReminderSchedule({
        recurrence: reminder.recurrence,
        occurrenceAt,
        intervalCount: reminder.intervalCount,
        timezone: reminder.timezone,
        occurrenceCount: reminder.occurrenceCount,
        maxOccurrences: reminder.maxOccurrences,
        stopAt: reminder.stopAt,
      });

  const advance = shouldAdvanceSchedule({
    failedEmail: failed > 0,
    retryableFailure,
  });

  await db.projectReminder.update({
    where: { id: reminder.id },
    data: {
      lastSentAt: advance ? new Date() : reminder.lastSentAt,
      occurrenceCount: advance ? reminder.occurrenceCount + 1 : reminder.occurrenceCount,
      nextSendAt: advance ? (nextSendAt ?? occurrenceAt) : occurrenceAt,
      enabled: advance ? nextSendAt != null : true,
      claimToken: null,
      claimedAt: null,
    },
  });

  return {
    ok: true as const,
    sent,
    failed,
    skipped,
    inApp,
    completed: advance && nextSendAt == null,
    retrying: retryableFailure,
  };
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
