import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";

export type NotificationItem = {
  id: string;
  source: "app" | "expense";
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listInboxNotifications(ctx: AuthContext, unreadOnly = false) {
  const [app, expense] = await Promise.all([
    db.appNotification.findMany({
      where: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.expenseNotification.findMany({
      where: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const items: NotificationItem[] = [
    ...app.map((row) => ({
      id: row.id,
      source: "app" as const,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    ...expense.map((row) => ({
      id: row.id,
      source: "expense" as const,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href ?? null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  ];

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, 40);
}

export async function markInboxNotificationsRead(ctx: AuthContext, ids?: string[]) {
  const idFilter = ids?.length ? { id: { in: ids } } : {};
  await Promise.all([
    db.appNotification.updateMany({
      where: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        readAt: null,
        ...idFilter,
      },
      data: { readAt: new Date() },
    }),
    db.expenseNotification.updateMany({
      where: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        readAt: null,
        ...idFilter,
      },
      data: { readAt: new Date() },
    }),
  ]);
  return { ok: true as const };
}

export async function clearInboxNotifications(ctx: AuthContext) {
  await Promise.all([
    db.appNotification.deleteMany({
      where: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
      },
    }),
    db.expenseNotification.deleteMany({
      where: {
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
      },
    }),
  ]);
  return { ok: true as const };
}

export async function getNotificationPreferences(ctx: AuthContext) {
  return {
    emailRemindersEnabled: ctx.employee.emailRemindersEnabled ?? true,
    inAppRemindersEnabled: ctx.employee.inAppRemindersEnabled ?? true,
  };
}

export async function updateNotificationPreferences(
  ctx: AuthContext,
  input: { emailRemindersEnabled?: boolean; inAppRemindersEnabled?: boolean }
) {
  const updated = await db.employeeProfile.update({
    where: { id: ctx.employee.id },
    data: {
      ...(input.emailRemindersEnabled != null
        ? { emailRemindersEnabled: input.emailRemindersEnabled }
        : {}),
      ...(input.inAppRemindersEnabled != null
        ? { inAppRemindersEnabled: input.inAppRemindersEnabled }
        : {}),
    },
    select: { emailRemindersEnabled: true, inAppRemindersEnabled: true },
  });
  return updated;
}
