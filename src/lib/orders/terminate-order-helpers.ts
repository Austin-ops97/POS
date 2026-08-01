import type { OrderStatus } from "@prisma/client";
import { PERMISSIONS } from "@/lib/permissions";
import {
  terminateOrderSchema,
  type TerminateOrderInput,
} from "@/lib/validations/orders";

export const TERMINATABLE_STATUSES = new Set<OrderStatus>([
  "DRAFT",
  "HELD",
  "PENDING_PAYMENT",
  "FAILED",
]);

export function isTerminatableStatus(status: string): boolean {
  return TERMINATABLE_STATUSES.has(status as OrderStatus);
}

export function canTerminateOrder(status: string): boolean {
  return isTerminatableStatus(status);
}

export function normalizeTerminationInput(raw: unknown): TerminateOrderInput {
  const parsed = terminateOrderSchema.parse(raw);
  return {
    reason: parsed.reason,
    notes: parsed.notes?.trim() ? parsed.notes.trim() : null,
  };
}

export class TerminationGateError extends Error {
  constructor(
    message: string,
    public statusCode: number = 403
  ) {
    super(message);
    this.name = "TerminationGateError";
  }
}

/** Pure auth gates used by tests and terminateOrder. */
export function assertTerminationAuthorized(opts: {
  hasTerminatePermission: boolean;
  moduleEnabled: boolean;
  settingsEnabled: boolean;
}): void {
  if (!opts.hasTerminatePermission) {
    throw new Error(`Missing permission: ${PERMISSIONS.TERMINATE_ORDER}`);
  }
  if (!opts.moduleEnabled) {
    throw new Error("Module disabled: ORDER_TERMINATION");
  }
  if (!opts.settingsEnabled) {
    throw new TerminationGateError(
      "Order termination is disabled for this business",
      403
    );
  }
}

/**
 * Returns "idempotent" when the order was already terminated, "proceed" when
 * it can be terminated, otherwise throws for invalid status.
 */
export function resolveTerminationState(order: {
  status: string;
  terminatedAt: Date | null;
}): "idempotent" | "proceed" {
  if (order.status === "CANCELED" && order.terminatedAt) {
    return "idempotent";
  }
  if (!isTerminatableStatus(order.status)) {
    throw new TerminationGateError(
      `Cannot terminate order with status: ${order.status}`,
      400
    );
  }
  return "proceed";
}

/**
 * Held/draft/pending orders do not reserve inventory today (quantityReserved is
 * unused). We still stamp inventoryRestoredAt as an idempotent marker so a
 * retry never attempts a second restore if SALE movements appear later.
 */
export function shouldSetInventoryRestoredAt(
  inventoryRestoredAt: Date | null | undefined
): boolean {
  return inventoryRestoredAt == null;
}
