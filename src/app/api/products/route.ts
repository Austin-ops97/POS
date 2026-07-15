import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { productSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";
import {
  BarcodeAssignmentError,
  syncProductPrimaryBarcode,
} from "@/lib/product-barcode";
import { isSafeImageUrl, sanitizeExternalText } from "@/lib/barcodes";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const ctx = await requireAuth();
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
                {
                  barcodes: {
                    some: {
                      normalizedValue: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        category: true,
        variants: { where: { isActive: true } },
        barcodes: true,
        modifierGroups: {
          include: {
            modifierGroup: {
              include: {
                options: {
                  where: { isActive: true },
                  orderBy: { name: "asc" },
                },
              },
            },
          },
        },
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

    const serialized = products.map((product) => ({
      ...product,
      price: Number(product.price),
      cost: product.cost != null ? Number(product.cost) : null,
      modifierGroups: product.modifierGroups
        .map((pm) => pm.modifierGroup)
        .filter((g) => g.isActive)
        .map((g) => ({
          id: g.id,
          name: g.name,
          required: g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceAdjustment: Number(o.priceAdjustment),
          })),
        })),
    }));

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

    return NextResponse.json({ products: serialized, total, limit, offset });
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

    const initialStock =
      data.type === "PHYSICAL" && data.trackInventory
        ? (data.initialStock ?? 0)
        : 0;

    const safeImage =
      data.imageUrl && isSafeImageUrl(data.imageUrl) ? data.imageUrl : undefined;
    const attribution = sanitizeExternalText(data.imageAttribution, 200);

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
          imageUrl: safeImage,
          price: data.price,
          cost: data.cost,
          type: data.type,
          taxable: data.taxable,
          trackInventory: data.trackInventory,
          isActive: data.isActive,
        },
        include: { category: true },
      });

      if (data.barcode) {
        await syncProductPrimaryBarcode(tx, {
          businessId: ctx.business.id,
          productId: created.id,
          barcode: data.barcode,
        });
      }

      if (data.trackInventory) {
        const locations = await tx.location.findMany({
          where: {
            businessId: ctx.business.id,
            isActive: true,
            deletedAt: null,
          },
        });

        const targetLocations =
          locations.length > 0
            ? locations
            : ctx.location
              ? [ctx.location]
              : [];

        if (targetLocations.length > 0) {
          for (const location of targetLocations) {
            const inventoryItem = await tx.inventoryItem.create({
              data: {
                businessId: ctx.business.id,
                locationId: location.id,
                productId: created.id,
                quantityOnHand: initialStock,
                costPerUnit: data.cost,
                ...(data.reorderPoint != null
                  ? { reorderPoint: data.reorderPoint }
                  : {}),
              },
            });

            if (initialStock > 0) {
              await tx.inventoryMovement.create({
                data: {
                  businessId: ctx.business.id,
                  inventoryItemId: inventoryItem.id,
                  type: "RECEIVED",
                  quantity: initialStock,
                  previousQty: 0,
                  newQty: initialStock,
                  reason: "Initial stock on product creation",
                  employeeId: ctx.employee.id,
                },
              });
            }
          }
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
      details: {
        name: product.name,
        sku: product.sku,
        barcode: data.barcode,
        imageAttribution: attribution,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error instanceof BarcodeAssignmentError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "DUPLICATE_BARCODE",
          existingProductId: error.existingProductId,
        },
        { status: 409 }
      );
    }
    return handleApiError(error, "POST /api/products");
  }
}
