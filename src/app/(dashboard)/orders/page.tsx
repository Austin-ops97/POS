import { requireAuth, hasPermission } from "@/lib/auth";
import { getEmployeeModuleAccess } from "@/lib/access-control";
import { db } from "@/lib/db";
import { getOrders } from "@/lib/queries";
import { PERMISSIONS } from "@/lib/permissions";
import { canTerminateOrder } from "@/lib/orders/terminate-order-helpers";
import { OrdersTable, type OrderRow } from "@/components/dashboard/orders-table";
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

  const orderRows = (orders as Array<{
    id: string;
    orderNumber: string;
    customer?: { firstName: string; lastName?: string | null } | null;
    employee?: { name: string } | null;
    total: unknown;
    status: string;
    createdAt: Date | string;
  }>).map((order) => {
    const status = order.status as OrderStatus;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer
        ? `${order.customer.firstName} ${order.customer.lastName ?? ""}`.trim()
        : null,
      employeeName: order.employee?.name ?? null,
      total: Number(order.total),
      status,
      createdAt: new Date(order.createdAt).toISOString(),
      canTerminate: canTerminateOrders && canTerminateOrder(status),
    } satisfies OrderRow;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">View and manage all orders</p>
      </div>
      <OrdersTable orders={orderRows} canTerminateOrders={canTerminateOrders} />
    </div>
  );
}
