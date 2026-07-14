import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getCustomerById } from "@/lib/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatOrderStatus,
  getOrderStatusVariant,
} from "@/lib/status-utils";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAuth();

  const customer = await getCustomerById(ctx, id);
  if (!customer) notFound();

  const orders = customer.orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    total: Number(o.total),
    createdAt: o.createdAt,
  }));
  const paidOrders = orders.filter((o) => o.status === "PAID" || o.status === "PARTIALLY_REFUNDED");
  const totalSpent = customer.totalSpent ?? paidOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrder = paidOrders.length > 0 ? totalSpent / paidOrders.length : 0;
  const lastOrder = orders[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {customer.firstName} {customer.lastName ?? ""}
          </h1>
          <p className="text-sm text-slate-500">
            Customer since {formatDate(customer.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Orders" value={String(orders.length)} />
        <StatCard title="Total Spent" value={formatCurrency(totalSpent)} />
        <StatCard title="Average Order" value={formatCurrency(avgOrder)} />
        <StatCard
          title="Last Order"
          value={lastOrder ? formatDate(lastOrder.createdAt) : "—"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {customer.email && (
              <p className="text-slate-600">
                <span className="font-medium text-slate-900">Email:</span> {customer.email}
              </p>
            )}
            {customer.phone && (
              <p className="text-slate-600">
                <span className="font-medium text-slate-900">Phone:</span> {customer.phone}
              </p>
            )}
            {"address" in customer && customer.address && (
              <p className="text-slate-600">
                <span className="font-medium text-slate-900">Address:</span> {customer.address}
              </p>
            )}
            {"tags" in customer && Array.isArray(customer.tags) && customer.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {customer.tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            )}
            {"notes" in customer && customer.notes && (
              <p className="pt-2 text-slate-600">{customer.notes}</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Order History</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-sm text-slate-500">No orders yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-3 text-left font-medium text-slate-600">Order</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Date</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Total</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: { id: string; orderNumber: string; createdAt: Date | string; total: number | string; status: string }) => (
                    <tr key={order.id} className="border-b border-slate-100">
                      <td className="py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="py-3 text-slate-600">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="py-3 font-medium text-slate-900">
                        {formatCurrency(Number(order.total))}
                      </td>
                      <td className="py-3">
                        <Badge variant={getOrderStatusVariant(order.status as Parameters<typeof getOrderStatusVariant>[0])}>
                          {formatOrderStatus(order.status as Parameters<typeof formatOrderStatus>[0])}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
