import { notFound } from "next/navigation";
import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getOrderById } from "@/lib/queries";
import {
  ensureReceiptForOrder,
  getReceiptData,
  ReceiptAccessError,
  ReceiptNotFoundError,
  renderReceiptHtml,
} from "@/lib/receipts";
import { ReceiptPreviewClient } from "@/components/receipts/receipt-preview-client";

export default async function ReceiptPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { id } = await params;
  const { autoprint } = await searchParams;
  const ctx = await requireAuth();
  await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

  const order = await getOrderById(ctx, id);
  if (!order) notFound();

  try {
    await ensureReceiptForOrder(ctx.business.id, id);
    const data = await getReceiptData(ctx.business.id, id);
    const receiptHtml = renderReceiptHtml(data);
    const customerEmail =
      order.customer && "email" in order.customer
        ? (order.customer.email as string | undefined)
        : undefined;

    return (
      <ReceiptPreviewClient
        orderId={id}
        orderNumber={order.orderNumber}
        receiptHtml={receiptHtml}
        defaultEmail={customerEmail}
        autoPrint={autoprint === "1"}
      />
    );
  } catch (error) {
    if (
      error instanceof ReceiptAccessError ||
      error instanceof ReceiptNotFoundError
    ) {
      notFound();
    }
    throw error;
  }
}
