import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { createAuditLog } from "@/lib/audit";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { requireAuth, requirePermission } from "@/lib/auth";
import { finalizeSuccessfulCardPayment } from "@/lib/card-payment";
import { db } from "@/lib/db";
import { OrderServiceError, serializeDecimal, toDecimal, validateOrderInventoryAvailability } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveRegisterCashier } from "@/lib/register-cashier";
import { isTerminalPaymentIntent } from "@/lib/register/tap-to-pay";
import { getStripeOrThrow } from "@/lib/stripe";

const startSchema = z.object({
  action: z.literal("start"),
  orderId: z.string().min(1),
  readerId: z.string().min(1),
});

const statusSchema = z.object({
  action: z.literal("status"),
  orderId: z.string().min(1),
});

const cancelSchema = z.object({
  action: z.literal("cancel"),
  orderId: z.string().min(1),
});

const terminalCheckoutSchema = z.discriminatedUnion("action", [
  startSchema,
  statusSchema,
  cancelSchema,
]);

function mapReaderStatus(status: string | null | undefined) {
  const map: Record<string, "ONLINE" | "OFFLINE" | "BUSY"> = {
    online: "ONLINE",
    offline: "OFFLINE",
    busy: "BUSY",
  };
  return map[status ?? ""] ?? "OFFLINE";
}

type ReaderAction = NonNullable<Stripe.Terminal.Reader["action"]>;

function actionPaymentIntentId(action: ReaderAction | null) {
  const paymentIntent = action?.process_payment_intent?.payment_intent;
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}

async function loadConnectAccount(businessId: string) {
  const stripeAccount = await db.stripeAccount.findUnique({
    where: { businessId },
  });
  if (!stripeAccount?.stripeAccountId || stripeAccount.status !== "READY") {
    throw new OrderServiceError("Stripe Connect account is not ready for payments", 400);
  }
  return stripeAccount.stripeAccountId;
}

async function paidResponse(
  paymentIntent: Stripe.PaymentIntent,
  orderNumber?: string | null
) {
  const result = await finalizeSuccessfulCardPayment(paymentIntent, "confirm");
  return NextResponse.json({
    status: "succeeded",
    paid: true,
    orderNumber: result.orderNumber || orderNumber || undefined,
    paymentIntentId: paymentIntent.id,
  });
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);

    const readers = await db.terminalReader.findMany({
      where: { businessId: ctx.business.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    const stripeAccount = await db.stripeAccount.findUnique({
      where: { businessId: ctx.business.id },
    });

    const deviceTypes = new Map<string, string>();
    const liveStatus = new Map<string, string>();

    if (stripeAccount?.stripeAccountId) {
      try {
        const stripe = getStripeOrThrow();
        const list = await stripe.terminal.readers.list(
          { limit: 100 },
          { stripeAccount: stripeAccount.stripeAccountId }
        );
        for (const reader of list.data) {
          deviceTypes.set(reader.id, reader.device_type);
          liveStatus.set(reader.id, mapReaderStatus(reader.status));
        }
      } catch (error) {
        console.warn("Failed to load Terminal readers for checkout:", error);
      }
    }

    return NextResponse.json({
      readers: readers.map((reader) => ({
        id: reader.id,
        name: reader.name,
        stripeReaderId: reader.stripeReaderId,
        status: reader.stripeReaderId
          ? (liveStatus.get(reader.stripeReaderId) ?? reader.status)
          : reader.status,
        isDefault: reader.isDefault,
        deviceType: reader.stripeReaderId
          ? (deviceTypes.get(reader.stripeReaderId) ?? null)
          : null,
      })),
    });
  } catch (error) {
    return handleApiError(error, "GET /api/checkout/terminal");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    await requirePermission(ctx, PERMISSIONS.PROCESS_SALE);
    const cashier = await resolveRegisterCashier(ctx, request);
    const parsed = terminalCheckoutSchema.parse(await request.json());
    const stripeAccountId = await loadConnectAccount(ctx.business.id);
    const stripe = getStripeOrThrow();

    const order = await db.order.findFirst({
      where: { id: parsed.orderId, businessId: ctx.business.id },
      include: { payments: { orderBy: { createdAt: "desc" } } },
    });
    if (!order) return jsonError("Order not found", 404);

    if (parsed.action === "status") {
      return await terminalStatus(stripe, stripeAccountId, order);
    }

    if (parsed.action === "cancel") {
      return await cancelTerminalPayment(stripe, stripeAccountId, order);
    }

    if (order.status !== "PENDING_PAYMENT") {
      return jsonError(`Order is not pending payment (status: ${order.status})`, 400);
    }

    await validateOrderInventoryAvailability(ctx.business.id, order.id);

    const readerRecord = await db.terminalReader.findFirst({
      where: { id: parsed.readerId, businessId: ctx.business.id },
    });
    if (!readerRecord?.stripeReaderId) {
      return jsonError("Connect a Stripe reader in Settings → Payments before Tap to Pay.", 400);
    }

    const reusable = await findReusableTerminalIntent(stripe, stripeAccountId, order.payments);
    if (reusable?.status === "succeeded") {
      return paidResponse(reusable.intent, order.orderNumber);
    }

    const amountCents = Math.round(Number(order.total) * 100);
    if (amountCents <= 0) {
      return jsonError("Order total must be greater than zero", 400);
    }

    let paymentIntent = reusable?.intent ?? null;
    let paymentId = reusable?.paymentId ?? null;

    if (!paymentIntent) {
      const terminalAttempts = await countTerminalPayments(stripe, stripeAccountId, order.payments);
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: "usd",
          payment_method_types: ["card_present"],
          capture_method: "automatic",
          metadata: {
            orderId: order.id,
            businessId: ctx.business.id,
            orderNumber: order.orderNumber,
            channel: "terminal",
            terminalReaderId: readerRecord.stripeReaderId,
          },
        },
        {
          stripeAccount: stripeAccountId,
          idempotencyKey: `order-terminal-${order.id}-${terminalAttempts}`,
        }
      );

      const payment = await db.payment.upsert({
        where: { stripePaymentIntentId: paymentIntent.id },
        create: {
          businessId: ctx.business.id,
          orderId: order.id,
          method: "CARD",
          status: "PENDING",
          amount: toDecimal(Number(order.total)),
          stripePaymentIntentId: paymentIntent.id,
        },
        update: {},
      });
      paymentId = payment.id;
    } else if (!paymentIntent.metadata?.terminalReaderId) {
      paymentIntent = await stripe.paymentIntents.update(
        paymentIntent.id,
        { metadata: { terminalReaderId: readerRecord.stripeReaderId } },
        { stripeAccount: stripeAccountId }
      );
    }

    const stripeReader = await stripe.terminal.readers.retrieve(
      readerRecord.stripeReaderId,
      {},
      { stripeAccount: stripeAccountId }
    );
    if ("deleted" in stripeReader && stripeReader.deleted) {
      return jsonError("That Stripe reader is no longer available.", 400);
    }

    const inProgressForThisIntent =
      stripeReader.action?.status === "in_progress" &&
      actionPaymentIntentId(stripeReader.action) === paymentIntent.id;

    if (!inProgressForThisIntent) {
      if (stripeReader.action?.status === "in_progress") {
        return jsonError("The reader is busy with another payment.", 409);
      }
      await stripe.terminal.readers.processPaymentIntent(
        readerRecord.stripeReaderId,
        {
          payment_intent: paymentIntent.id,
          process_config: { enable_customer_cancellation: true },
        },
        { stripeAccount: stripeAccountId }
      );
    }

    if (paymentId) {
      await db.payment.update({
        where: { id: paymentId },
        data: { status: "PROCESSING" },
      });
    }

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: cashier.id,
      action: "PAYMENT",
      entity: "Payment",
      entityId: paymentId ?? paymentIntent.id,
      details: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
        readerId: readerRecord.stripeReaderId,
        channel: "terminal",
        cashierName: cashier.name,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      status: "processing",
      paid: false,
      paymentIntentId: paymentIntent.id,
      readerName: readerRecord.name,
      amount: serializeDecimal(order.total),
    });
  } catch (error) {
    if (error instanceof OrderServiceError) {
      return jsonError(error.message, error.statusCode);
    }
    if (error instanceof Stripe.errors.StripeError) {
      return jsonError(error.message || "Stripe could not reach the reader.", 502);
    }
    return handleApiError(error, "POST /api/checkout/terminal");
  }
}

async function countTerminalPayments(
  stripe: Stripe,
  stripeAccountId: string,
  payments: Array<{ stripePaymentIntentId: string | null }>
) {
  let count = 0;
  for (const payment of payments) {
    if (!payment.stripePaymentIntentId) continue;
    const intent = await stripe.paymentIntents.retrieve(
      payment.stripePaymentIntentId,
      {},
      { stripeAccount: stripeAccountId }
    );
    if (isTerminalPaymentIntent(intent)) count += 1;
  }
  return count;
}

async function findReusableTerminalIntent(
  stripe: Stripe,
  stripeAccountId: string,
  payments: Array<{ id: string; stripePaymentIntentId: string | null }>
) {
  for (const payment of payments) {
    if (!payment.stripePaymentIntentId) continue;
    const intent = await stripe.paymentIntents.retrieve(
      payment.stripePaymentIntentId,
      { expand: ["latest_charge"] },
      { stripeAccount: stripeAccountId }
    );
    if (!isTerminalPaymentIntent(intent)) continue;
    if (intent.status === "succeeded") {
      return { status: "succeeded" as const, intent, paymentId: payment.id };
    }
    if (intent.status === "canceled") continue;
    return { status: "open" as const, intent, paymentId: payment.id };
  }
  return null;
}

async function terminalStatus(
  stripe: Stripe,
  stripeAccountId: string,
  order: {
    id: string;
    orderNumber: string;
    status: string;
    payments: Array<{ id: string; stripePaymentIntentId: string | null }>;
  }
) {
  if (order.status === "PAID") {
    return NextResponse.json({
      status: "succeeded",
      paid: true,
      orderNumber: order.orderNumber,
    });
  }

  const reusable = await findReusableTerminalIntent(stripe, stripeAccountId, order.payments);
  if (!reusable) return jsonError("No Tap to Pay payment found for this order", 400);
  if (reusable.status === "succeeded") {
    return paidResponse(reusable.intent, order.orderNumber);
  }

  let paymentIntent = reusable.intent;
  if (paymentIntent.status === "requires_capture") {
    paymentIntent = await stripe.paymentIntents.capture(
      paymentIntent.id,
      { expand: ["latest_charge"] },
      { stripeAccount: stripeAccountId }
    );
  }
  if (paymentIntent.status === "succeeded") {
    return paidResponse(paymentIntent, order.orderNumber);
  }

  const readerId = paymentIntent.metadata?.terminalReaderId;
  if (readerId) {
    const reader = await stripe.terminal.readers.retrieve(readerId, {}, { stripeAccount: stripeAccountId });
    if (!("deleted" in reader && reader.deleted) && actionPaymentIntentId(reader.action) === paymentIntent.id) {
      if (reader.action?.status === "failed") {
        return NextResponse.json({
          status: "failed",
          paid: false,
          message: reader.action.failure_message || "The reader could not take the payment. Use Card or try again.",
        });
      }
      if (reader.action?.status === "in_progress") {
        return NextResponse.json({ status: "processing", paid: false });
      }
    }
  }

  if (paymentIntent.status === "canceled") {
    return NextResponse.json({
      status: "failed",
      paid: false,
      message: "Tap to Pay was canceled.",
    });
  }

  return NextResponse.json({ status: "processing", paid: false });
}

async function cancelTerminalPayment(
  stripe: Stripe,
  stripeAccountId: string,
  order: {
    id: string;
    orderNumber: string;
    payments: Array<{ id: string; stripePaymentIntentId: string | null }>;
  }
) {
  const reusable = await findReusableTerminalIntent(stripe, stripeAccountId, order.payments);
  if (!reusable) {
    return NextResponse.json({ status: "canceled", paid: false });
  }
  if (reusable.status === "succeeded") {
    return paidResponse(reusable.intent, order.orderNumber);
  }

  const readerId = reusable.intent.metadata?.terminalReaderId;
  if (readerId) {
    try {
      await stripe.terminal.readers.cancelAction(readerId, {}, { stripeAccount: stripeAccountId });
    } catch (error) {
      const latest = await stripe.paymentIntents.retrieve(
        reusable.intent.id,
        { expand: ["latest_charge"] },
        { stripeAccount: stripeAccountId }
      );
      if (latest.status === "succeeded") {
        return paidResponse(latest, order.orderNumber);
      }
      if (latest.status === "requires_capture") {
        const captured = await stripe.paymentIntents.capture(
          latest.id,
          { expand: ["latest_charge"] },
          { stripeAccount: stripeAccountId }
        );
        return paidResponse(captured, order.orderNumber);
      }
      throw error;
    }
  }

  return NextResponse.json({ status: "canceled", paid: false });
}
