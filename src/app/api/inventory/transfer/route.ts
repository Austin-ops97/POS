import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

const transferSchema = z.object({
  inventoryItemId: z.string().min(1),
  toLocationId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_INVENTORY}`);
    }

    const data = transferSchema.parse(await request.json());

    const source = await db.inventoryItem.findFirst({
      where: {
        id: data.inventoryItemId,
        businessId: ctx.business.id,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!source) {
      return jsonError("Inventory item not found", 404);
    }

    if (source.locationId === data.toLocationId) {
      return jsonError("Destination location must differ from source", 400);
    }

    const destinationLocation = await db.location.findFirst({
      where: {
        id: data.toLocationId,
        businessId: ctx.business.id,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!destinationLocation) {
      return jsonError("Destination location not found", 404);
    }

    if (source.quantityOnHand < data.quantity) {
      return jsonError("Insufficient quantity for transfer", 400);
    }

    const result = await db.$transaction(async (tx) => {
      const sourcePrevious = source.quantityOnHand;
      const sourceNew = sourcePrevious - data.quantity;

      const updatedSource = await tx.inventoryItem.update({
        where: { id: source.id },
        data: { quantityOnHand: sourceNew },
      });

      await tx.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: source.id,
          type: "TRANSFER_OUT",
          quantity: -data.quantity,
          previousQty: sourcePrevious,
          newQty: sourceNew,
          reason: data.reason ?? `Transfer to ${destinationLocation.name}`,
          employeeId: ctx.employee.id,
        },
      });

      let destination = await tx.inventoryItem.findFirst({
        where: {
          businessId: ctx.business.id,
          locationId: data.toLocationId,
          productId: source.productId,
        },
      });

      if (!destination) {
        destination = await tx.inventoryItem.create({
          data: {
            businessId: ctx.business.id,
            locationId: data.toLocationId,
            productId: source.productId,
            quantityOnHand: 0,
            quantityReserved: 0,
            reorderPoint: source.reorderPoint,
          },
        });
      }

      const destPrevious = destination.quantityOnHand;
      const destNew = destPrevious + data.quantity;

      const updatedDestination = await tx.inventoryItem.update({
        where: { id: destination.id },
        data: { quantityOnHand: destNew },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          location: { select: { id: true, name: true } },
        },
      });

      await tx.inventoryMovement.create({
        data: {
          businessId: ctx.business.id,
          inventoryItemId: destination.id,
          type: "TRANSFER_IN",
          quantity: data.quantity,
          previousQty: destPrevious,
          newQty: destNew,
          reason: data.reason ?? `Transfer from ${source.location.name}`,
          employeeId: ctx.employee.id,
        },
      });

      return {
        source: updatedSource,
        destination: updatedDestination,
      };
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "INVENTORY_ADJUSTMENT",
      entity: "InventoryItem",
      entityId: source.id,
      details: {
        type: "TRANSFER",
        quantity: data.quantity,
        fromLocationId: source.locationId,
        toLocationId: data.toLocationId,
        productName: source.product.name,
        reason: data.reason,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/inventory/transfer");
  }
}
