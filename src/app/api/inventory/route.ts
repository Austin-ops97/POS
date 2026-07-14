import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_INVENTORY}`);
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId");
    const productId = searchParams.get("productId");
    const search = searchParams.get("search")?.trim();
    const lowStock = searchParams.get("lowStock") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where = {
      businessId: ctx.business.id,
      ...(locationId ? { locationId } : {}),
      ...(productId ? { productId } : {}),
      ...(search
        ? {
            product: {
              deletedAt: null,
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { sku: { contains: search, mode: "insensitive" as const } },
                { barcode: { contains: search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };

    const allItems = await db.inventoryItem.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            price: true,
            isActive: true,
          },
        },
        location: {
          select: { id: true, name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const filteredItems = lowStock
      ? allItems.filter((item) => item.quantityOnHand <= item.reorderPoint)
      : allItems;

    const items = filteredItems.slice(offset, offset + limit);

    return NextResponse.json({
      items,
      total: filteredItems.length,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/inventory");
  }
}
