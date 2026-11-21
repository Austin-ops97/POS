import { requireAuth, hasPermission } from "@/lib/auth";
import { getEmployeeModuleAccess } from "@/lib/access-control";
import { db } from "@/lib/db";
import { getOrders } from "@/lib/queries";
import { PERMISSIONS } from "@/lib/permissions";
import { canTerminateOrder } from "@/lib/orders/terminate-order-helpers";
import { OrdersTable, type OrderRow } from "@/components/dashboard/orders-table";
import { orderSnapshotForProject } from "@/lib/office/project-create";
import type { OrderStatus } from "@prisma/client";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const ctx = await requireAuth();
  const [orders, moduleAccess, settings] = await Promise.all([
    getOrders(ctx),
    getEmployeeModuleAccess(ctx),
    db.businessSetting.findUnique({
      where: { businessId: ctx.business.id },
      select: { enableOrderTermination: true },
    }),
  ]);

  const canTerminateOrders =
    hasPermission(ctx, PERMISSIONS.TERMINATE_ORDER) &&
    moduleAccess.ORDER_TERMINATION &&
    settings?.enableOrderTermination !== false;
  const canCreateProject =
    moduleAccess.OFFICE &&
    moduleAccess.PROJECTS &&
    hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS);
  const projectEmployees = canCreateProject
    ? await db.employeeProfile.findMany({
        where: { businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const orderRows = (orders as Array<{
    id: string;
    orderNumber: string;
    customer?: { firstName: string; lastName?: string | null } | null;
    employee?: { name: string } | null;
    subtotal?: unknown;
    discountAmount?: unknown;
    taxAmount?: unknown;
    total: unknown;
    status: string;
    createdAt: Date | string;
    items?: Array<{ name: string; quantity: number; unitPrice?: unknown; total?: unknown }>;
  }>).map((order) => {
    const status = order.status as OrderStatus;
    const snapshot = orderSnapshotForProject(order);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: (order as { customerId?: string | null }).customerId ?? null,
      customerName: order.customer
        ? `${order.customer.firstName} ${order.customer.lastName ?? ""}`.trim()
        : null,
      employeeName: order.employee?.name ?? null,
      total: Number(order.total),
      status,
      createdAt: new Date(order.createdAt).toISOString(),
      canTerminate: canTerminateOrders && canTerminateOrder(status),
      projectDescription: snapshot.description,
      orderLines: snapshot.orderLines,
      orderTotals: snapshot.orderTotals,
    } satisfies OrderRow;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">View and manage all orders</p>
      </div>
      <OrdersTable
        orders={orderRows}
        canTerminateOrders={canTerminateOrders}
        canCreateProject={canCreateProject}
        projectEmployees={projectEmployees}
      />
    </div>
  );
}
