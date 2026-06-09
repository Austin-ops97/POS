import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { productSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const categoryId = searchParams.get("categoryId");
    const isActive = searchParams.get("isActive");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const products = await db.product.findMany({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(categoryId ? { categoryId } : {}),
        ...(isActive !== null && isActive !== ""
          ? { isActive: isActive === "true" }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search, mode: "insensitive" } },
                { brand: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        variants: { where: { isActive: true } },
        inventoryItems: {
          where: { businessId: ctx.business.id },
          select: {
            id: true,
            locationId: true,
            quantityOnHand: true,
            quantityReserved: true,
            reorderPoint: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    });

    const total = await db.product.count({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        ...(categoryId ? { categoryId } : {}),
        ...(isActive !== null && isActive !== ""
          ? { isActive: isActive === "true" }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { barcode: { contains: search, mode: "insensitive" } },
                { brand: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    });

    return NextResponse.json({ products, total, limit, offset });
  } catch (error) {
    return handleApiError(error, "GET /api/products");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PRODUCTS}`);
    }

    const body = await request.json();
    const data = productSchema.parse(body);

    if (data.categoryId) {
      const category = await db.category.findFirst({
        where: {
          id: data.categoryId,
          businessId: ctx.business.id,
          deletedAt: null,
        },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
    }

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          businessId: ctx.business.id,
          name: data.name,
          description: data.description,
          sku: data.sku,
          barcode: data.barcode,
          categoryId: data.categoryId,
          brand: data.brand,
          supplier: data.supplier,
          price: data.price,
          cost: data.cost,
          type: data.type,
          taxable: data.taxable,
          trackInventory: data.trackInventory,
          isActive: data.isActive,
        },
        include: { category: true },
      });

      if (data.trackInventory) {
        const locations = await tx.location.findMany({
          where: { businessId: ctx.business.id, isActive: true, deletedAt: null },
        });

        const targetLocations =
          locations.length > 0
            ? locations
            : ctx.location
              ? [ctx.location]
              : [];

        if (targetLocations.length > 0) {
          await tx.inventoryItem.createMany({
            data: targetLocations.map((location) => ({
              businessId: ctx.business.id,
              locationId: location.id,
              productId: created.id,
              quantityOnHand: 0,
              costPerUnit: data.cost,
            })),
            skipDuplicates: true,
          });
        }
      }

      return created;
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "CREATE",
      entity: "Product",
      entityId: product.id,
      details: { name: product.name, sku: product.sku },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/products");
  }
}
