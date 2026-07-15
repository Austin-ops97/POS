import Link from "next/link";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Package,
  AlertTriangle,
  Plus,
  ClipboardList,
  BarChart3,
  CreditCard,
  Calendar,
  Wallet,
} from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatOrderStatus, getOrderStatusVariant } from "@/lib/status-utils";
import { hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";


export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const { stats, recentOrders, lowStock, topProducts, salesByDay, stripe, setup } =
    await getDashboardData(ctx);

  const chartData =
    salesByDay.length > 0
      ? salesByDay.map((d) => ({
          date: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }),
          sales: d.sales,
        }))
      : [];

  const salesChange =
    stats.yesterdaySales > 0
      ? ((stats.todaySales - stats.yesterdaySales) / stats.yesterdaySales) * 100
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {ctx.business.name} · {ctx.location?.name ?? "All locations"}
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

      <SetupChecklist
        status={setup}
        canSeedDemo={hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS)}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Sales"
          value={formatCurrency(stats.todaySales)}
          subtitle={
            salesChange != null
              ? `${salesChange >= 0 ? "+" : ""}${salesChange.toFixed(1)}% vs yesterday`
              : "Paid orders today"
          }
          icon={DollarSign}
        />
        <StatCard
          title="Yesterday"
          value={formatCurrency(stats.yesterdaySales)}
          subtitle="Previous day"
          icon={TrendingDown}
        />
        <StatCard
          title="This Week"
          value={formatCurrency(stats.weekSales)}
          subtitle={`${stats.weekTransactions ?? 0} transactions`}
          icon={Calendar}
        />
        <StatCard
          title="This Month"
          value={formatCurrency(stats.monthSales)}
          subtitle="Month to date"
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Average Ticket"
          value={formatCurrency(stats.aov)}
          subtitle="Today's AOV"
        />
        <StatCard
          title="Transactions"
          value={String(stats.transactionCount)}
          subtitle="Completed today"
        />
        <StatCard
          title="Available Balance"
          value={formatCurrency(stripe.available)}
          subtitle={stripe.connected ? "Stripe Connect" : "Connect Stripe"}
          icon={Wallet}
        />
        <StatCard
          title="Pending Payout"
          value={formatCurrency(stripe.pending)}
          subtitle={
            stripe.upcomingDeposit?.arrivalDate
              ? `Deposit ${formatDate(stripe.upcomingDeposit.arrivalDate)}`
              : "Awaiting transfer"
          }
          icon={CreditCard}
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
            {chartData.length > 0 ? (
              <SalesChart data={chartData} />
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No sales yet"
                description="Complete your first sale to see trends here."
                actionLabel="Open Register"
                actionHref="/register"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-slate-400" />
              Top Products
            </CardTitle>
            <Link href="/products">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-slate-500">No sales data this week.</p>
            ) : (
              <ul className="space-y-3">
                {topProducts.map((item, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.quantity} sold</p>
                    </div>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(item.revenue)}
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
              Low Inventory
            </CardTitle>
            <Link href="/inventory">
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-slate-500">All stock levels are healthy.</p>
            ) : (
              <ul className="space-y-3">
                {lowStock.map((item) => (
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
            <Link href="/orders">
              <Button variant="ghost" size="sm">
                View all
              </Button>
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
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {formatCurrency(Number(order.total))}
                      </span>
                      <Badge
                        variant={getOrderStatusVariant(
                          order.status as Parameters<typeof getOrderStatusVariant>[0]
                        )}
                      >
                        {formatOrderStatus(
                          order.status as Parameters<typeof formatOrderStatus>[0]
                        )}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {stripe.connected && stripe.upcomingDeposit && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium text-slate-900">Upcoming deposit</p>
                <p className="text-sm text-slate-600">
                  {formatCurrency(stripe.upcomingDeposit.amount)} arriving{" "}
                  {stripe.upcomingDeposit.arrivalDate
                    ? formatDate(stripe.upcomingDeposit.arrivalDate)
                    : "soon"}
                </p>
              </div>
            </div>
            <Link href="/payments">
              <Button variant="outline" size="sm">
                View payments
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
