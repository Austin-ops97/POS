import { db } from "@/lib/db";
import type { ExpenseNotificationType } from "@prisma/client";

export async function notifyEmployee(params: {
  businessId: string;
  employeeId: string;
  type: ExpenseNotificationType;
  title: string;
  body: string;
  expenseId?: string;
  href?: string;
}) {
  return db.expenseNotification.create({
    data: {
      businessId: params.businessId,
      employeeId: params.employeeId,
      type: params.type,
      title: params.title,
      body: params.body,
      expenseId: params.expenseId,
      href: params.href ?? (params.expenseId ? `/finance/expenses/${params.expenseId}` : undefined),
    },
  });
}

export async function notifyManagers(params: {
  businessId: string;
  type: ExpenseNotificationType;
  title: string;
  body: string;
  expenseId?: string;
  excludeEmployeeId?: string;
}) {
  const managers = await db.employeeProfile.findMany({
    where: {
      businessId: params.businessId,
      status: "ACTIVE",
      deletedAt: null,
      ...(params.excludeEmployeeId ? { id: { not: params.excludeEmployeeId } } : {}),
      role: {
        OR: [
          { name: "Owner" },
          { name: "Admin" },
          { name: "Manager" },
          { name: "Finance" },
          {
            permissions: {
              some: {
                permission: { key: "approve_expenses" },
              },
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  if (managers.length === 0) return [];

  return db.expenseNotification.createMany({
    data: managers.map((m) => ({
      businessId: params.businessId,
      employeeId: m.id,
      type: params.type,
      title: params.title,
      body: params.body,
      expenseId: params.expenseId,
      href: params.expenseId
        ? `/finance/expenses/${params.expenseId}`
        : "/finance/expenses/approvals",
    })),
  });
}

export async function listNotifications(employeeId: string, unreadOnly = false) {
  return db.expenseNotification.findMany({
    where: {
      employeeId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationsRead(employeeId: string, ids?: string[]) {
  return db.expenseNotification.updateMany({
    where: {
      employeeId,
      readAt: null,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
}
