import type { OrderTerminationReason, PaymentStatus } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import { hasPermission, requirePermission } from "@/lib/auth";
import { requireModule } from "@/lib/access-control";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { OrderServiceError, serializeDecimal } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { getStripeOrThrow } from "@/lib/stripe";
import {
  assertTerminationAuthorized,
  normalizeTerminationInput,
  resolveTerminationState,
  shouldSetInventoryRestoredAt,
  TerminationGateError,
} from "@/lib/orders/terminate-order-helpers";

export {
  TERMINATABLE_STATUSES,
  isTerminatableStatus,
  canTerminateOrder,
  normalizeTerminationInput,
  assertTerminationAuthorized,
  resolveTerminationState,
  shouldSetInventoryRestoredAt,
} from "@/lib/orders/terminate-order-helpers";

function rethrowGate(error: unknown): never {
  if (error instanceof TerminationGateError) {
    throw new OrderServiceError(error.message, error.statusCode);
  }
  throw error;
}

const OPEN_PAYMENT_STATUSES = new Set<PaymentStatus>([
  "PENDING",
  "PROCESSING",
  "REQUIRES_ACTION",
]);

export type TerminateOrderResult = {
  id: string;
  orderNumber: string;
  status: string;
  terminatedAt: string | null;
  terminationReason: OrderTerminationReason | null;
  terminationNotes: string | null;
  terminatedByName: string | null;
  inventoryRestoredAt: string | null;
  total: number;
  alreadyTerminated: boolean;
};

export async function terminateOrder(
  ctx: AuthContext,
  orderId: string,
  rawInput: unknown,
  ip?: string
): Promise<TerminateOrderResult> {
  await requirePermission(ctx, PERMISSIONS.TERMINATE_ORDER);
  await requireModule(ctx, "ORDER_TERMINATION");

  const settings = await db.businessSetting.findUnique({
    where: { businessId: ctx.business.id },
    select: { enableOrderTermination: true },
  });

  try {
    assertTerminationAuthorized({
      hasTerminatePermission: hasPermission(ctx, PERMISSIONS.TERMINATE_ORDER),
      moduleEnabled: true,
      settingsEnabled: settings?.enableOrderTermination !== false,
    });
  } catch (error) {
    rethrowGate(error);
  }

  const input = normalizeTerminationInput(rawInput);

  const order = await db.order.findFirst({
    where: { id: orderId, businessId: ctx.business.id },
    include: {
      payments: {
        where: {
          status: { in: ["PENDING", "PROCESSING", "REQUIRES_ACTION"] },
          stripePaymentIntentId: { not: null },
        },
      },
    },
  });

  if (!order) {
    throw new OrderServiceError("Order not found", 404);
  }

  let state: "idempotent" | "proceed";
  try {
    state = resolveTerminationState({
      status: order.status,
      terminatedAt: order.terminatedAt,
    });
  } catch (error) {
    rethrowGate(error);
  }

  if (state === "idempotent") {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      terminatedAt: order.terminatedAt?.toISOString() ?? null,
      terminationReason: order.terminationReason,
      terminationNotes: order.terminationNotes,
      terminatedByName: order.terminatedByName,
      inventoryRestoredAt: order.inventoryRestoredAt?.toISOString() ?? null,
      total: Number(order.total),
      alreadyTerminated: true,
    };
  }

  await cancelOpenPaymentIntents(ctx.business.id, order.payments);

  const now = new Date();
  const markInventoryRestored = shouldSetInventoryRestoredAt(
    order.inventoryRestoredAt
  );

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELED",
        terminatedAt: now,
        terminatedById: ctx.employee.id,
        terminatedByName: ctx.employee.name,
        terminationReason: input.reason,
        terminationNotes: input.notes,
        ...(markInventoryRestored ? { inventoryRestoredAt: now } : {}),
      },
    });

    if (order.payments.length > 0) {
      await tx.payment.updateMany({
        where: {
          id: { in: order.payments.map((p) => p.id) },
          status: { not: "SUCCEEDED" },
        },
        data: { status: "CANCELED" },
      });
    }

    return result;
  });

  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "ORDER_TERMINATE",
    entity: "Order",
    entityId: order.id,
    details: {
      orderNumber: order.orderNumber,
      previousStatus: order.status,
      reason: input.reason,
      notes: input.notes,
      canceledPaymentIds: order.payments.map((p) => p.id),
      inventoryRestored: markInventoryRestored,
    },
    ipAddress: ip,
  });

  return {
    id: updated.id,
    orderNumber: updated.orderNumber,
    status: updated.status,
    terminatedAt: updated.terminatedAt?.toISOString() ?? null,
    terminationReason: updated.terminationReason,
    terminationNotes: updated.terminationNotes,
    terminatedByName: updated.terminatedByName,
    inventoryRestoredAt: updated.inventoryRestoredAt?.toISOString() ?? null,
    total: Number(serializeDecimal(updated.total)),
    alreadyTerminated: false,
  };
}

async function cancelOpenPaymentIntents(
  businessId: string,
  payments: Array<{
    id: string;
    status: PaymentStatus;
    stripePaymentIntentId: string | null;
  }>
) {
  const open = payments.filter(
    (p) => p.stripePaymentIntentId && OPEN_PAYMENT_STATUSES.has(p.status)
  );
  if (open.length === 0) return;

  const stripeAccount = await db.stripeAccount.findUnique({
    where: { businessId },
    select: { stripeAccountId: true },
  });

  // Without a Connect account we still cancel locally; Stripe cancel is skipped.
  if (!stripeAccount?.stripeAccountId) return;

  const stripe = getStripeOrThrow();
  for (const payment of open) {
    const intentId = payment.stripePaymentIntentId!;
    try {
      const intent = await stripe.paymentIntents.retrieve(intentId, undefined, {
        stripeAccount: stripeAccount.stripeAccountId,
      });
      // Never cancel a succeeded intent.
      if (intent.status === "succeeded") continue;
      if (intent.status === "canceled") continue;

      await stripe.paymentIntents.cancel(
        intentId,
        {},
        { stripeAccount: stripeAccount.stripeAccountId }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Ignore already-canceled intents; surface other Stripe failures.
      if (/already been canceled|cannot be canceled/i.test(message)) {
        continue;
      }
      throw new OrderServiceError(
        `Failed to cancel Stripe payment intent: ${message}`,
        502
      );
    }
  }
}
