import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_INVENTORY}`);
    }

    const { id } = await params;
    const inventoryItem = await db.inventoryItem.findFirst({
      where: { id, businessId: ctx.business.id },
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

    if (inventoryItem.quantityReserved > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete this item while units are reserved for open orders",
        },
        { status: 409 }
      );
    }

    const openScanLine = await db.inventoryScanLine.findFirst({
      where: {
        inventoryItemId: inventoryItem.id,
        session: {
          businessId: ctx.business.id,
          status: "OPEN",
        },
      },
      select: { id: true },
    });
    if (openScanLine) {
      return NextResponse.json(
        {
          error:
            "Cannot delete this item while it is in an open scan session. Finish or cancel the scan first.",
        },
        { status: 409 }
      );
    }

    await db.inventoryItem.delete({ where: { id: inventoryItem.id } });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "DELETE",
      entity: "InventoryItem",
      entityId: inventoryItem.id,
      details: {
        productName: inventoryItem.product.name,
        sku: inventoryItem.product.sku,
        locationName: inventoryItem.location.name,
        previousQty: inventoryItem.quantityOnHand,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/inventory/[id]");
  }
}
