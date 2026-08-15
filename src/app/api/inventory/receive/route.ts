import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { inventoryReceiveSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.RECEIVE_INVENTORY)) {
      throw new Error(`Missing permission: ${PERMISSIONS.RECEIVE_INVENTORY}`);
    }
    const data = inventoryReceiveSchema.parse(await request.json());
    const item = await db.inventoryItem.findFirst({
      where: { id: data.inventoryItemId, businessId: ctx.business.id },
      include: { product: { select: { name: true, sku: true } }, location: { select: { name: true } } },
    });
    if (!item) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

    const previousQty = item.quantityOnHand;
    const newQty = previousQty + data.quantity;
    const receivedAt = data.receivedAt ? new Date(data.receivedAt) : new Date();
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantityOnHand: newQty,
          ...(data.unitCost !== undefined ? { costPerUnit: data.unitCost } : {}),
        },
      });
      const movement = await tx.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: item.id,
          type: "RECEIVED",
          quantity: data.quantity,
          previousQty,
          newQty,
          reason: data.notes,
          employeeId: ctx.employee.id,
        },
      });
      const receipt = await tx.inventoryReceipt.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: item.id,
          employeeId: ctx.employee.id,
          quantity: data.quantity,
          unitCost: data.unitCost,
          supplier: data.supplier,
          referenceNumber: data.referenceNumber,
          receivedAt,
          notes: data.notes,
        },
      });
      return { updated, movement, receipt };
    });
    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "INVENTORY_ADJUSTMENT",
      entity: "InventoryReceipt",
      entityId: result.receipt.id,
      details: { quantity: data.quantity, unitCost: data.unitCost, supplier: data.supplier, referenceNumber: data.referenceNumber },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/inventory/receive");
  }
}
