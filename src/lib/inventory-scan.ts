import type { InventoryScanMode, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { verifyLocationAccess } from "@/lib/order-service";
import { normalizeBarcode, isUsableBarcode } from "@/lib/barcodes";
import { findBarcodeAssignment } from "@/lib/product-barcode";
import { createAuditLog } from "@/lib/audit";

export class ScanSessionError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "SCAN_SESSION_ERROR"
  ) {
    super(message);
    this.name = "ScanSessionError";
  }
}

function permissionForMode(mode: InventoryScanMode): PermissionKey {
  switch (mode) {
    case "RECEIVE":
      return PERMISSIONS.RECEIVE_INVENTORY;
    case "CYCLE_COUNT":
      return PERMISSIONS.PERFORM_INVENTORY_COUNT;
    case "DAMAGED":
    case "LOST":
      return PERMISSIONS.ADJUST_INVENTORY;
    default:
      return PERMISSIONS.MANAGE_INVENTORY;
  }
}

export function assertScanModePermission(
  ctx: AuthContext,
  mode: InventoryScanMode
) {
  const required = permissionForMode(mode);
  const allowed =
    hasPermission(ctx, required) ||
    hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY) ||
    hasPermission(ctx, PERMISSIONS.ADJUST_INVENTORY);
  if (!allowed) {
    throw new ScanSessionError(
      `Missing permission: ${required}`,
      403,
      "FORBIDDEN"
    );
  }
}

function computeProposedDelta(
  mode: InventoryScanMode,
  expectedQty: number,
  scannedQty: number
): number {
  switch (mode) {
    case "RECEIVE":
      return scannedQty;
    case "CYCLE_COUNT":
      return scannedQty - expectedQty;
    case "DAMAGED":
    case "LOST":
      return -Math.abs(scannedQty);
    default:
      return 0;
  }
}

function movementTypeForMode(
  mode: InventoryScanMode
): "RECEIVED" | "MANUAL_ADJUSTMENT" | "DAMAGED" | "LOST" {
  switch (mode) {
    case "RECEIVE":
      return "RECEIVED";
    case "CYCLE_COUNT":
      return "MANUAL_ADJUSTMENT";
    case "DAMAGED":
      return "DAMAGED";
    case "LOST":
      return "LOST";
  }
}

export async function createScanSession(
  ctx: AuthContext,
  input: {
    locationId: string;
    mode: InventoryScanMode;
    idempotencyKey?: string;
  }
) {
  assertScanModePermission(ctx, input.mode);
  await verifyLocationAccess(ctx, input.locationId);

  if (input.idempotencyKey) {
    const existing = await db.inventoryScanSession.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      if (existing.businessId !== ctx.business.id) {
        throw new ScanSessionError("Idempotency key conflict", 409);
      }
      return existing;
    }
  }

  return db.inventoryScanSession.create({
    data: {
      businessId: ctx.business.id,
      locationId: input.locationId,
      employeeId: ctx.employee.id,
      mode: input.mode,
      idempotencyKey: input.idempotencyKey,
    },
    include: { lines: true },
  });
}

export async function getScanSession(ctx: AuthContext, sessionId: string) {
  const session = await db.inventoryScanSession.findFirst({
    where: { id: sessionId, businessId: ctx.business.id },
    include: {
      lines: true,
      location: { select: { id: true, name: true } },
    },
  });
  if (!session) {
    throw new ScanSessionError("Scan session not found", 404, "NOT_FOUND");
  }
  return session;
}

export async function addScanLine(
  ctx: AuthContext,
  sessionId: string,
  input: { barcode: string; quantity?: number; detectedFormat?: string }
) {
  const session = await getScanSession(ctx, sessionId);
  if (session.status !== "OPEN") {
    throw new ScanSessionError("Session is not open", 409, "SESSION_CLOSED");
  }
  assertScanModePermission(ctx, session.mode);

  const barcode = normalizeBarcode(input.barcode, {
    detectedFormat: input.detectedFormat,
  });
  if (!isUsableBarcode(barcode)) {
    throw new ScanSessionError("Invalid barcode", 400, "INVALID_BARCODE");
  }

  const assignment = await findBarcodeAssignment(
    db,
    ctx.business.id,
    barcode
  );
  if (!assignment) {
    throw new ScanSessionError(
      "Barcode not found in this business",
      404,
      "PRODUCT_NOT_FOUND"
    );
  }

  if (!assignment.product.trackInventory) {
    throw new ScanSessionError(
      "Product does not track inventory",
      400,
      "NOT_TRACKED"
    );
  }

  let inventoryItem = await db.inventoryItem.findFirst({
    where: {
      businessId: ctx.business.id,
      locationId: session.locationId,
      productId: assignment.productId,
    },
  });

  if (!inventoryItem) {
    inventoryItem = await db.inventoryItem.create({
      data: {
        businessId: ctx.business.id,
        locationId: session.locationId,
        productId: assignment.productId,
        quantityOnHand: 0,
      },
    });
  }

  const qtyInc = input.quantity ?? 1;
  const existingLine = await db.inventoryScanLine.findUnique({
    where: {
      sessionId_inventoryItemId: {
        sessionId: session.id,
        inventoryItemId: inventoryItem.id,
      },
    },
  });

  if (existingLine) {
    const scannedQty = existingLine.scannedQty + qtyInc;
    const proposedDelta = computeProposedDelta(
      session.mode,
      existingLine.expectedQty,
      scannedQty
    );
    return db.inventoryScanLine.update({
      where: { id: existingLine.id },
      data: { scannedQty, proposedDelta, normalizedCode: barcode.normalizedValue },
    });
  }

  const expectedQty = inventoryItem.quantityOnHand;
  const scannedQty = qtyInc;
  const proposedDelta = computeProposedDelta(
    session.mode,
    expectedQty,
    scannedQty
  );

  return db.inventoryScanLine.create({
    data: {
      sessionId: session.id,
      productId: assignment.productId,
      variantId: assignment.variantId,
      inventoryItemId: inventoryItem.id,
      normalizedCode: barcode.normalizedValue,
      expectedQty,
      scannedQty,
      proposedDelta,
    },
  });
}

export async function updateScanLine(
  ctx: AuthContext,
  sessionId: string,
  lineId: string,
  scannedQty: number
) {
  const session = await getScanSession(ctx, sessionId);
  if (session.status !== "OPEN") {
    throw new ScanSessionError("Session is not open", 409, "SESSION_CLOSED");
  }
  assertScanModePermission(ctx, session.mode);

  const line = session.lines.find((l) => l.id === lineId);
  if (!line) {
    throw new ScanSessionError("Scan line not found", 404, "NOT_FOUND");
  }

  const proposedDelta = computeProposedDelta(
    session.mode,
    line.expectedQty,
    scannedQty
  );

  return db.inventoryScanLine.update({
    where: { id: lineId },
    data: { scannedQty, proposedDelta },
  });
}

export async function cancelScanSession(ctx: AuthContext, sessionId: string) {
  const session = await getScanSession(ctx, sessionId);
  if (session.status === "APPLIED") {
    throw new ScanSessionError("Session already applied", 409, "ALREADY_APPLIED");
  }
  if (session.status === "CANCELLED") return session;

  return db.inventoryScanSession.update({
    where: { id: session.id },
    data: { status: "CANCELLED" },
    include: { lines: true },
  });
}

export type ApplyConflict = {
  lineId: string;
  productId: string;
  inventoryItemId: string;
  expectedQty: number;
  currentQty: number;
  scannedQty: number;
  proposedDelta: number;
};

export async function applyScanSession(
  ctx: AuthContext,
  sessionId: string,
  options: {
    acceptConflicts?: boolean;
    reason?: string;
    idempotencyKey?: string;
  } = {}
) {
  const session = await getScanSession(ctx, sessionId);
  assertScanModePermission(ctx, session.mode);

  if (session.status === "APPLIED") {
    return { session, movements: [], conflicts: [] as ApplyConflict[], alreadyApplied: true };
  }
  if (session.status === "CANCELLED") {
    throw new ScanSessionError("Session was cancelled", 409, "CANCELLED");
  }

  await verifyLocationAccess(ctx, session.locationId);

  const conflicts: ApplyConflict[] = [];
  const lines = session.lines.filter((l) => l.proposedDelta !== 0 || session.mode === "CYCLE_COUNT");

  for (const line of lines) {
    const item = await db.inventoryItem.findFirst({
      where: {
        id: line.inventoryItemId,
        businessId: ctx.business.id,
        locationId: session.locationId,
      },
    });
    if (!item) {
      throw new ScanSessionError(
        `Inventory item missing for line ${line.id}`,
        409,
        "INVENTORY_MISSING"
      );
    }
    if (item.quantityOnHand !== line.expectedQty) {
      conflicts.push({
        lineId: line.id,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId,
        expectedQty: line.expectedQty,
        currentQty: item.quantityOnHand,
        scannedQty: line.scannedQty,
        proposedDelta: computeProposedDelta(
          session.mode,
          item.quantityOnHand,
          line.scannedQty
        ),
      });
    }
  }

  if (conflicts.length > 0 && !options.acceptConflicts) {
    return { session, movements: [], conflicts, alreadyApplied: false };
  }

  const movementType = movementTypeForMode(session.mode);
  const result = await db.$transaction(async (tx) => {
    // Re-check status inside transaction for idempotency
    const locked = await tx.inventoryScanSession.findFirst({
      where: { id: session.id, businessId: ctx.business.id },
      include: { lines: true },
    });
    if (!locked) {
      throw new ScanSessionError("Scan session not found", 404);
    }
    if (locked.status === "APPLIED") {
      return { movements: [] as Prisma.InventoryMovementGetPayload<object>[], alreadyApplied: true };
    }
    if (locked.status !== "OPEN") {
      throw new ScanSessionError("Session is not open", 409);
    }

    const movements = [];
    for (const line of locked.lines) {
      const item = await tx.inventoryItem.findFirst({
        where: {
          id: line.inventoryItemId,
          businessId: ctx.business.id,
        },
      });
      if (!item) continue;

      const proposedDelta = computeProposedDelta(
        locked.mode,
        item.quantityOnHand,
        line.scannedQty
      );
      if (proposedDelta === 0) continue;

      const previousQty = item.quantityOnHand;
      const newQty = previousQty + proposedDelta;
      if (newQty < 0) {
        throw new ScanSessionError(
          `Adjustment would result in negative inventory for product ${line.productId}`,
          400,
          "NEGATIVE_STOCK"
        );
      }

      // Optimistic concurrency: only update if qty still matches what we read
      const updated = await tx.inventoryItem.updateMany({
        where: {
          id: item.id,
          quantityOnHand: previousQty,
        },
        data: { quantityOnHand: newQty },
      });
      if (updated.count !== 1) {
        throw new ScanSessionError(
          "Inventory changed during apply. Review conflicts and retry.",
          409,
          "CONCURRENT_CHANGE"
        );
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: item.id,
          type: movementType,
          quantity: proposedDelta,
          previousQty,
          newQty,
          reason:
            options.reason ||
            `Inventory scan session ${locked.id} (${locked.mode})`,
          referenceId: locked.id,
          employeeId: ctx.employee.id,
        },
      });
      movements.push(movement);

      await tx.inventoryScanLine.update({
        where: { id: line.id },
        data: {
          expectedQty: previousQty,
          proposedDelta,
        },
      });
    }

    await tx.inventoryScanSession.update({
      where: { id: locked.id },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        ...(options.idempotencyKey && !locked.idempotencyKey
          ? { idempotencyKey: options.idempotencyKey }
          : {}),
      },
    });

    return { movements, alreadyApplied: false };
  });

  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "INVENTORY_ADJUSTMENT",
    entity: "InventoryScanSession",
    entityId: session.id,
    details: {
      mode: session.mode,
      locationId: session.locationId,
      movementCount: result.movements.length,
      reason: options.reason,
    },
  });

  const refreshed = await getScanSession(ctx, sessionId);
  return {
    session: refreshed,
    movements: result.movements,
    conflicts: [] as ApplyConflict[],
    alreadyApplied: result.alreadyApplied,
  };
}
