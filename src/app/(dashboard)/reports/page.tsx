import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReportsContent } from "@/components/dashboard/reports-content";

export default async function ReportsPage() {
  const ctx = await requireAuth();
  const businessId = ctx.business.id;
  const locationId = ctx.location?.id;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const orders = await db.order.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      paidAt: { gte: thirtyDaysAgo },
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    },
    include: {
      payments: { where: { status: "SUCCEEDED" } },
      employee: true,
    },
  });

  const salesByDayMap: Record<string, { sales: number; orders: number }> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    salesByDayMap[key] = { sales: 0, orders: 0 };
  }

  for (const order of orders) {
    if (!order.paidAt) continue;
    const key = order.paidAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (salesByDayMap[key]) {
      salesByDayMap[key].sales += Number(order.total);
      salesByDayMap[key].orders += 1;
    }
  }

  const salesByDay = Object.entries(salesByDayMap).map(([date, data]) => ({
    date,
    ...data,
  }));

  const topProductItems = await db.orderItem.groupBy({
    by: ["name"],
    where: {
      order: {
        businessId,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        paidAt: { gte: thirtyDaysAgo },
      },
    },
    _sum: { quantity: true, total: true },
    orderBy: { _sum: { total: "desc" } },
    take: 8,
  });

  const topProducts = topProductItems.map((item) => ({
    name: item.name,
    revenue: Number(item._sum.total ?? 0),
    quantity: Number(item._sum.quantity ?? 0),
  }));

  const employeeSalesMap = new Map<string, { name: string; sales: number; orders: number }>();
  for (const order of orders) {
    const empName = order.employee?.name ?? "Unassigned";
    const existing = employeeSalesMap.get(empName) ?? {
      name: empName,
      sales: 0,
      orders: 0,
    };
    existing.sales += Number(order.total);
    existing.orders += 1;
    employeeSalesMap.set(empName, existing);
  }
  const employeeSales = Array.from(employeeSalesMap.values())
    .sort((a, b) => b.sales - a.sales);

  const paymentMethodMap = new Map<string, number>();
  for (const order of orders) {
    for (const payment of order.payments) {
      const method = payment.method;
      paymentMethodMap.set(
        method,
        (paymentMethodMap.get(method) ?? 0) + Number(payment.amount)
      );
    }
  }
  const paymentMethods = Array.from(paymentMethodMap.entries()).map(
    ([method, amount]) => ({ method, amount })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Sales analytics and business insights — last 30 days
        </p>
      </div>
      <ReportsContent
        salesByDay={salesByDay}
        topProducts={topProducts}
        employeeSales={employeeSales}
        paymentMethods={paymentMethods}
      />
    </div>
  );
}
