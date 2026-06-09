import { requireAuth } from "@/lib/auth";
import { getOrders } from "@/lib/queries";
import { OrdersTable, type OrderRow } from "@/components/dashboard/orders-table";
import type { OrderStatus } from "@prisma/client";

export default async function OrdersPage() {
  const ctx = await requireAuth();
  const orders = await getOrders(ctx);

  const orderRows = (orders as Array<{
    id: string;
    orderNumber: string;
    customer?: { firstName: string; lastName?: string | null } | null;
    total: unknown;
    status: string;
    createdAt: Date | string;
  }>).map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer
      ? `${order.customer.firstName} ${order.customer.lastName ?? ""}`.trim()
      : null,
    total: Number(order.total),
    status: order.status as OrderStatus,
    createdAt: new Date(order.createdAt).toISOString(),
  })) as OrderRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">View and manage all orders</p>
      </div>
      <OrdersTable orders={orderRows} />
    </div>
  );
}
