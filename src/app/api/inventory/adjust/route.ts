import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { inventoryAdjustSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_INVENTORY}`);
    }

    const body = await request.json();
    const data = inventoryAdjustSchema.parse(body);

    const inventoryItem = await db.inventoryItem.findFirst({
      where: {
        id: data.inventoryItemId,
        businessId: ctx.business.id,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!inventoryItem) {
      return NextResponse.json(
        { error: "Inventory item not found" },
        { status: 404 }
      );
    }

    const previousQty = inventoryItem.quantityOnHand;
    const newQty = previousQty + data.quantity;

    if (newQty < 0) {
      return NextResponse.json(
        { error: "Adjustment would result in negative inventory" },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { quantityOnHand: newQty },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          location: { select: { id: true, name: true } },
        },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: inventoryItem.id,
          type: data.type,
          quantity: data.quantity,
          previousQty,
          newQty,
          reason: data.reason,
          employeeId: ctx.employee.id,
        },
      });

      return { inventoryItem: updated, movement };
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "INVENTORY_ADJUSTMENT",
      entity: "InventoryItem",
      entityId: inventoryItem.id,
      details: {
        type: data.type,
        quantity: data.quantity,
        previousQty,
        newQty,
        reason: data.reason,
        productName: inventoryItem.product.name,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/inventory/adjust");
  }
}
