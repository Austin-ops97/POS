import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrdersTable } from "@/components/dashboard/orders-table";

export default async function OrdersPage() {
  const ctx = await requireAuth();
  const businessId = ctx.business.id;
  const locationId = ctx.location?.id;

  const orders = await db.order.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const orderRows = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer
      ? `${order.customer.firstName} ${order.customer.lastName ?? ""}`.trim()
      : null,
    total: Number(order.total),
    status: order.status,
    createdAt: order.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">
          View and manage all orders
        </p>
      </div>
      <OrdersTable orders={orderRows} />
    </div>
  );
}
