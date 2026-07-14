import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getOrderById } from "@/lib/queries";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatOrderStatus,
  getOrderStatusVariant,
  getPaymentStatusVariant,
} from "@/lib/status-utils";
import { OrderRefundActions } from "@/components/dashboard/order-refund-actions";
import { OrderReceiptActions } from "@/components/receipts/order-receipt-actions";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAuth();

  const order = await getOrderById(ctx, id);
  if (!order) notFound();

  const canRefund =
    order.status === "PAID" || order.status === "PARTIALLY_REFUNDED";

  const priorRefunded =
    order.refunds?.reduce(
      (sum: number, r: { amount: unknown }) => sum + Number(r.amount),
      0
    ) ?? 0;
  const remainingRefundable = Number(order.total) - priorRefunded;
  const showRefund = canRefund && remainingRefundable > 0;

  const refundItems = order.items.map(
    (item: { id: string; name: string; quantity: number }) => {
      const alreadyRefunded =
        order.refunds
          ?.flatMap(
            (r: { items?: Array<{ orderItemId: string; quantity: number }> }) =>
              r.items ?? []
          )
          .filter(
            (ri: { orderItemId: string }) => ri.orderItemId === item.id
          )
          .reduce(
            (sum: number, ri: { quantity: number }) => sum + ri.quantity,
            0
          ) ?? 0;

      return {
        id: item.id,
        name: item.name,
        availableQty: item.quantity - alreadyRefunded,
      };
    }
  );

  const latestReceipt = order.receipts?.[0];
  const customerEmail =
    order.customer && "email" in order.customer
      ? (order.customer.email as string | undefined)
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/orders">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {order.orderNumber}
              </h1>
              <Badge variant={getOrderStatusVariant(order.status as Parameters<typeof getOrderStatusVariant>[0])}>
                {formatOrderStatus(order.status as Parameters<typeof formatOrderStatus>[0])}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              {formatDate(order.createdAt)}
              {(() => {
                const loc = (order as unknown as { location?: { name: string } }).location;
                return loc ? ` · ${loc.name}` : "";
              })()}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 lg:flex-row lg:items-start">
          {showRefund && (
            <OrderRefundActions
              orderId={order.id}
              canRefund={showRefund}
              remainingRefundable={remainingRefundable}
              items={refundItems}
            />
          )}
          <div className="min-w-[280px]">
            <OrderReceiptActions
              orderId={order.id}
              defaultEmail={customerEmail}
              emailedTo={latestReceipt?.emailedTo}
              lastEmailedAt={
                latestReceipt?.lastEmailedAt
                  ? new Date(latestReceipt.lastEmailedAt).toISOString()
                  : undefined
              }
              printed={latestReceipt?.printed}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-3 text-left font-medium text-slate-600">Item</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Qty</th>
                    <th className="pb-3 text-left font-medium text-slate-600">Price</th>
                    <th className="pb-3 text-right font-medium text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-3">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        {item.sku && (
                          <p className="text-xs text-slate-500">{item.sku}</p>
                        )}
                      </td>
                      <td className="py-3 text-slate-600">{item.quantity}</td>
                      <td className="py-3 text-slate-600">
                        {formatCurrency(Number(item.unitPrice))}
                      </td>
                      <td className="py-3 text-right font-medium text-slate-900">
                        {formatCurrency(Number(item.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Separator className="my-4" />
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(Number(order.subtotal))}</span>
                </div>
                {Number(order.discountAmount) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(Number(order.discountAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Tax</span>
                  <span>{formatCurrency(Number(order.taxAmount))}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-slate-900">
                  <span>Total</span>
                  <span>{formatCurrency(Number(order.total))}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {order.refunds?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {order.refunds.map((refund: { id: string; amount: unknown; reason: string; createdAt: Date | string }) => (
                    <li
                      key={refund.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {formatCurrency(Number(refund.amount))}
                        </p>
                        <p className="text-xs text-slate-500">
                          {refund.reason.replace(/_/g, " ")} · {formatDate(refund.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              {order.customer ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-slate-900">
                    <Link
                      href={`/customers/${"id" in order.customer ? order.customer.id : (order as { customerId?: string }).customerId}`}
                      className="hover:underline"
                    >
                      {order.customer.firstName} {order.customer.lastName ?? ""}
                    </Link>
                  </p>
                  {"email" in order.customer && order.customer.email && (
                    <p className="text-slate-600">{order.customer.email}</p>
                  )}
                  {"phone" in order.customer && order.customer.phone && (
                    <p className="text-slate-600">{order.customer.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Walk-in customer</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {order.payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {order.payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {payment.method}
                          {payment.cardLast4 &&
                            ` · ${payment.cardBrand ?? ""} ${payment.cardLast4}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {payment.createdAt ? formatDate(payment.createdAt) : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-slate-900">
                          {formatCurrency(Number(payment.amount))}
                        </p>
                        <Badge variant={getPaymentStatusVariant(payment.status)}>
                          {payment.status}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {order.employee && (
            <Card>
              <CardHeader>
                <CardTitle>Employee</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-slate-900">
                  {order.employee.name}
                </p>
              </CardContent>
            </Card>
          )}

          {order.receipts && order.receipts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Receipts</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {order.receipts.map(
                    (receipt: {
                      id: string;
                      receiptNumber: string;
                      printed?: boolean;
                      printedAt?: Date | string | null;
                      emailedTo?: string | null;
                      lastEmailedAt?: Date | string | null;
                    }) => (
                      <li key={receipt.id} className="text-slate-600">
                        <span className="font-medium text-slate-900">
                          {receipt.receiptNumber}
                        </span>
                        {receipt.printed && " · Printed"}
                        {receipt.emailedTo
                          ? ` · Emailed to ${receipt.emailedTo}`
                          : " · Not emailed"}
                        {receipt.lastEmailedAt && (
                          <span className="block text-xs text-slate-500">
                            Last emailed {formatDate(receipt.lastEmailedAt)}
                          </span>
                        )}
                      </li>
                    )
                  )}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
