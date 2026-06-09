import Link from "next/link";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  RotateCcw,
  Package,
  AlertTriangle,
  Plus,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatOrderStatus, getOrderStatusVariant } from "@/lib/status-utils";

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const { stats, recentOrders, lowStock, topProducts, salesByHour } =
    await getDashboardData(ctx);

  const chartData =
    salesByHour.length > 0
      ? salesByHour.map((d: { hour: string; sales: number }) => ({
          date: d.hour,
          sales: d.sales,
        }))
      : [
          { date: "Mon", sales: 45 },
          { date: "Tue", sales: 62 },
          { date: "Wed", sales: 58 },
          { date: "Thu", sales: 91 },
          { date: "Fri", sales: stats.todaySales },
          { date: "Sat", sales: 120 },
          { date: "Sun", sales: 75 },
        ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Overview of today&apos;s performance</p>
        </div>
        <div className="flex gap-2">
          <Link href="/register">
            <Button><Plus className="h-4 w-4" />New Sale</Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline"><BarChart3 className="h-4 w-4" />Reports</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Today's Sales" value={formatCurrency(stats.todaySales)} subtitle="Paid orders" />
        <StatCard title="Transactions" value={String(stats.transactionCount)} subtitle="Completed today" />
        <StatCard title="Average Order" value={formatCurrency(stats.aov)} subtitle="AOV today" />
        <StatCard title="Refunds" value={formatCurrency(stats.refundTotal)} subtitle="Issued today" />
        <StatCard title="Card Sales" value={formatCurrency(stats.cardSales)} subtitle="Card payments" />
        <StatCard title="Cash Sales" value={formatCurrency(stats.cashSales)} subtitle="Cash payments" />
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
            {topProducts.length === 0 ? (
              <p className="text-sm text-slate-500">No sales data yet.</p>
            ) : (
              <ul className="space-y-3">
                {topProducts.map((item: { name: string; quantity: number; revenue: number }, i: number) => (
                  <li key={i} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.quantity} sold</p>
                    </div>
                    <span className="font-medium text-slate-900">{formatCurrency(item.revenue)}</span>
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
            <Link href="/inventory"><Button variant="ghost" size="sm">View all</Button></Link>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-slate-500">All stock levels are healthy.</p>
            ) : (
              <ul className="space-y-3">
                {lowStock.map((item: { id: string; quantityOnHand: number; product: { name: string } }) => (
                  <li key={item.id} className="flex items-center justify-between">
                    <span className="text-slate-900">{item.product.name}</span>
                    <Badge variant="warning">{item.quantityOnHand} left</Badge>
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
            <Link href="/orders"><Button variant="ghost" size="sm">View all</Button></Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <EmptyState icon={ShoppingBag} title="No orders yet" description="Start selling to see orders here." actionLabel="Open Register" actionHref="/register" />
            ) : (
              <ul className="space-y-3">
                {(recentOrders as Array<{
                  id: string;
                  orderNumber: string;
                  total: unknown;
                  status: string;
                  createdAt: Date | string;
                  customer?: { firstName: string; lastName?: string | null } | null;
                }>).map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/orders/${order.id}`} className="font-medium text-slate-900 hover:underline">
                        {order.orderNumber}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {order.customer ? `${order.customer.firstName} ${order.customer.lastName ?? ""}`.trim() : "Walk-in"}
                        · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-medium text-slate-900">{formatCurrency(Number(order.total))}</span>
                      <Badge variant={getOrderStatusVariant(order.status as Parameters<typeof getOrderStatusVariant>[0])}>{formatOrderStatus(order.status as Parameters<typeof formatOrderStatus>[0])}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/products/new"><Button variant="outline" className="w-full h-auto py-4 flex-col gap-1"><Package className="h-5 w-5" />Add Product</Button></Link>
        <Link href="/register"><Button variant="outline" className="w-full h-auto py-4 flex-col gap-1"><DollarSign className="h-5 w-5" />New Sale</Button></Link>
        <Link href="/customers"><Button variant="outline" className="w-full h-auto py-4 flex-col gap-1"><ShoppingBag className="h-5 w-5" />Customers</Button></Link>
        <Link href="/inventory"><Button variant="outline" className="w-full h-auto py-4 flex-col gap-1"><RotateCcw className="h-5 w-5" />Inventory</Button></Link>
      </div>
    </div>
  );
}
