import { requireAuth, hasPermission, hasAnyPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { OfficeCommandCenter } from "@/components/office/office-command-center";

export default async function OfficePage() {
  const ctx = await requireAuth();
  const canViewDocuments = hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS);
  const canViewCustomers = hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS);
  const canViewEmployees = hasAnyPermission(ctx, [
    PERMISSIONS.VIEW_WORKFORCE,
    PERMISSIONS.MANAGE_EMPLOYEES,
  ]);
  const canViewOrders = hasAnyPermission(ctx, [
    PERMISSIONS.OPEN_REGISTER,
    PERMISSIONS.PROCESS_REFUND,
    PERMISSIONS.VIEW_REPORTS,
  ]);
  const canViewTeamExpenses = hasAnyPermission(ctx, [
    PERMISSIONS.VIEW_TEAM_EXPENSES,
    PERMISSIONS.APPROVE_EXPENSES,
  ]);
  const canViewOwnExpenses = hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES);
  const [documents, customers, employees, openOrders, openWork, pendingExpenses, recentRecords] =
    await Promise.all([
      canViewDocuments
        ? db.officeDocument.count({ where: { businessId: ctx.business.id, deletedAt: null } })
        : 0,
      canViewCustomers
        ? db.customer.count({ where: { businessId: ctx.business.id, deletedAt: null } })
        : null,
      canViewEmployees
        ? db.employeeProfile.count({ where: { businessId: ctx.business.id, deletedAt: null, status: "ACTIVE" } })
        : null,
      canViewOrders
        ? db.order.count({
            where: {
              businessId: ctx.business.id,
              status: { in: ["DRAFT", "HELD", "PENDING_PAYMENT"] },
            },
          })
        : null,
      db.officeWorkspaceRecord.count({
        where: { businessId: ctx.business.id, archivedAt: null, status: { not: "COMPLETE" } },
      }),
      canViewTeamExpenses || canViewOwnExpenses
        ? db.expense.count({
            where: {
              businessId: ctx.business.id,
              ...(canViewTeamExpenses ? {} : { employeeId: ctx.employee.id }),
              status: { in: ["SUBMITTED", "PENDING_APPROVAL", "NEEDS_MORE_INFO"] },
            },
          })
        : null,
      db.officeWorkspaceRecord.findMany({
        where: { businessId: ctx.business.id, archivedAt: null },
        include: {
          createdBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

  return (
    <OfficeCommandCenter
      businessName={ctx.business.name}
      firstName={ctx.employee.preferredName || ctx.employee.name.split(" ")[0] || "there"}
      metrics={{ documents, customers, employees, openOrders, openWork, pendingExpenses }}
      recentRecords={recentRecords.map((record) => ({
        ...record,
        metadata: record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? record.metadata as Record<string, unknown>
          : null,
        dueAt: record.dueAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      }))}
      canCreate={hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS)}
    />
  );
}
