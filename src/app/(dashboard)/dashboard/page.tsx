import Link from "next/link";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  RotateCcw,
  CreditCard,
  Banknote,
  Package,
  AlertTriangle,
  Plus,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatOrderStatus,
  getOrderStatusVariant,
} from "@/lib/status-utils";

function getStartOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const businessId = ctx.business.id;
  const locationId = ctx.location?.id;

  const todayStart = getStartOfDay(new Date());
  const todayEnd = getEndOfDay(new Date());

  const todayOrders = await db.order.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      paidAt: { gte: todayStart, lte: todayEnd },
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    },
    include: { payments: true },
  });

  const todaySales = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const transactionCount = todayOrders.length;
  const aov = transactionCount > 0 ? todaySales / transactionCount : 0;

  const todayRefunds = await db.refund.aggregate({
    where: {
      businessId,
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    _sum: { amount: true },
  });
  const refundTotal = Number(todayRefunds._sum.amount ?? 0);

  let cardSales = 0;
  let cashSales = 0;
  for (const order of todayOrders) {
    for (const payment of order.payments) {
      if (payment.status !== "SUCCEEDED") continue;
      const amt = Number(payment.amount);
      if (payment.method === "CARD") cardSales += amt;
      if (payment.method === "CASH") cashSales += amt;
    }
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const weekOrders = await db.order.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
      paidAt: { gte: sevenDaysAgo },
      status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
    },
    select: { paidAt: true, total: true },
  });

  const salesByDay: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    salesByDay[d.toLocaleDateString("en-US", { weekday: "short" })] = 0;
  }
  for (const order of weekOrders) {
    if (!order.paidAt) continue;
    const key = order.paidAt.toLocaleDateString("en-US", { weekday: "short" });
    if (salesByDay[key] !== undefined) {
      salesByDay[key] += Number(order.total);
    }
  }
  const chartData = Object.entries(salesByDay).map(([date, sales]) => ({
    date,
    sales,
  }));

  const topProductItems = await db.orderItem.groupBy({
    by: ["productId", "name"],
    where: {
      order: {
        businessId,
        status: { in: ["PAID", "PARTIALLY_REFUNDED"] },
        paidAt: { gte: sevenDaysAgo },
      },
      productId: { not: null },
    },
    _sum: { quantity: true, total: true },
    orderBy: { _sum: { total: "desc" } },
    take: 5,
  });

  const allInventory = await db.inventoryItem.findMany({
    where: {
      businessId,
      ...(locationId ? { locationId } : {}),
    },
    include: { product: true },
    orderBy: { quantityOnHand: "asc" },
  });
  const lowStockItems = allInventory
    .filter((item) => item.quantityOnHand <= item.reorderPoint)
    .slice(0, 5);

  const recentOrders = await db.order.findMany({
    where: { businessId, ...(locationId ? { locationId } : {}) },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Overview of today&apos;s performance
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/register">
            <Button>
              <Plus className="h-4 w-4" />
              New Sale
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Today's Sales"
          value={formatCurrency(todaySales)}
          subtitle="Paid orders"
        />
        <StatCard
          title="Transactions"
          value={String(transactionCount)}
          subtitle="Completed today"
        />
        <StatCard
          title="Average Order"
          value={formatCurrency(aov)}
          subtitle="AOV today"
        />
        <StatCard
          title="Refunds"
          value={formatCurrency(refundTotal)}
          subtitle="Issued today"
        />
        <StatCard
          title="Card Sales"
          value={formatCurrency(cardSales)}
          subtitle="Card payments"
        />
        <StatCard
          title="Cash Sales"
          value={formatCurrency(cashSales)}
          subtitle="Cash payments"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-slate-400" />
              Sales — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={chartData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-400" />
              Top Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProductItems.length === 0 ? (
              <p className="text-sm text-slate-500">No sales data yet.</p>
            ) : (
              <ul className="space-y-3">
                {topProductItems.map((item, i) => (
                  <li key={item.productId ?? i} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item._sum.quantity ?? 0} sold
                      </p>
                    </div>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(Number(item._sum.total ?? 0))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Low Stock
            </CardTitle>
            <Link href="/inventory">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-slate-500">All stock levels are healthy.</p>
            ) : (
              <ul className="space-y-3">
                {lowStockItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between">
                    <span className="text-slate-900">{item.product.name}</span>
                    <Badge variant="warning">
                      {item.quantityOnHand} left
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-slate-400" />
              Recent Orders
            </CardTitle>
            <Link href="/orders">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No orders yet"
                description="Start selling to see orders here."
                actionLabel="Open Register"
                actionHref="/register"
              />
            ) : (
              <ul className="space-y-3">
                {recentOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {order.customer
                          ? `${order.customer.firstName} ${order.customer.lastName ?? ""}`.trim()
                          : "Walk-in"}
                        · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-medium text-slate-900">
                        {formatCurrency(Number(order.total))}
                      </span>
                      <Badge variant={getOrderStatusVariant(order.status)}>
                        {formatOrderStatus(order.status)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/products/new">
          <Button variant="outline" className="w-full h-auto py-4 flex-col gap-1">
            <Package className="h-5 w-5" />
            Add Product
          </Button>
        </Link>
        <Link href="/register">
          <Button variant="outline" className="w-full h-auto py-4 flex-col gap-1">
            <DollarSign className="h-5 w-5" />
            New Sale
          </Button>
        </Link>
        <Link href="/customers">
          <Button variant="outline" className="w-full h-auto py-4 flex-col gap-1">
            <ShoppingBag className="h-5 w-5" />
            Customers
          </Button>
        </Link>
        <Link href="/inventory">
          <Button variant="outline" className="w-full h-auto py-4 flex-col gap-1">
            <RotateCcw className="h-5 w-5" />
            Inventory
          </Button>
        </Link>
      </div>
    </div>
  );
}
