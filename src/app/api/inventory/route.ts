import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

    if (lowStock) {
      const rows = await db.$queryRaw<{ id: string; total: bigint }[]>`
        WITH matched AS (
          SELECT i.id
          FROM "InventoryItem" i
          INNER JOIN "Product" p ON p.id = i."productId"
          WHERE i."businessId" = ${ctx.business.id}
            ${locationId ? Prisma.sql`AND i."locationId" = ${locationId}` : Prisma.empty}
            ${productId ? Prisma.sql`AND i."productId" = ${productId}` : Prisma.empty}
            ${
              search
                ? Prisma.sql`AND (
                    p.name ILIKE ${`%${search}%`}
                    OR COALESCE(p.sku, '') ILIKE ${`%${search}%`}
                    OR COALESCE(p.barcode, '') ILIKE ${`%${search}%`}
                  )`
                : Prisma.empty
            }
            AND i."quantityOnHand" <= i."reorderPoint"
          ORDER BY i."updatedAt" DESC
        )
        SELECT id, COUNT(*) OVER() AS total
        FROM matched
        OFFSET ${offset}
        LIMIT ${limit}
      `;

      const total = rows[0] ? Number(rows[0].total) : 0;
      const ids = rows.map((r) => r.id);
      const items =
        ids.length === 0
          ? []
          : await db.inventoryItem.findMany({
              where: { id: { in: ids } },
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
                location: { select: { id: true, name: true } },
              },
            });
      const order = new Map(ids.map((id, idx) => [id, idx]));
      items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

      return NextResponse.json({ items, total, limit, offset });
    }

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

    const [items, total] = await Promise.all([
      db.inventoryItem.findMany({
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
        take: limit,
        skip: offset,
      }),
      db.inventoryItem.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/inventory");
  }
}
