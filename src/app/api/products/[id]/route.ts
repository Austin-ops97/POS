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

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;

    const product = await db.product.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
        deletedAt: null,
      },
      include: {
        category: true,
        variants: { where: { isActive: true } },
        barcodes: true,
        inventoryItems: {
          where: { businessId: ctx.business.id },
          include: { location: { select: { id: true, name: true } } },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    return handleApiError(error, "GET /api/products/[id]");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PRODUCTS}`);
    }

    const { id } = await params;
    const body = await request.json();
    const data = productSchema.partial().parse(body);

    const existing = await db.product.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

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

    const safeImage =
      data.imageUrl !== undefined
        ? data.imageUrl && isSafeImageUrl(data.imageUrl)
          ? data.imageUrl
          : null
        : undefined;
    const attribution = sanitizeExternalText(data.imageAttribution, 200);

    const product = await db.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          sku: data.sku,
          barcode: data.barcode,
          categoryId: data.categoryId,
          brand: data.brand,
          supplier: data.supplier,
          ...(safeImage !== undefined ? { imageUrl: safeImage } : {}),
          price: data.price,
          cost: data.cost,
          type: data.type,
          taxable: data.taxable,
          trackInventory: data.trackInventory,
          isActive: data.isActive,
        },
        include: { category: true, barcodes: true },
      });

      if (data.barcode !== undefined) {
        await syncProductPrimaryBarcode(tx, {
          businessId: ctx.business.id,
          productId: id,
          barcode: data.barcode,
        });
      }

      return updated;
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "UPDATE",
      entity: "Product",
      entityId: product.id,
      details: { ...data, imageAttribution: attribution },
    });

    return NextResponse.json(product);
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
    return handleApiError(error, "PATCH /api/products/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS)) {
      throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PRODUCTS}`);
    }

    const { id } = await params;

    const existing = await db.product.findFirst({
      where: {
        id,
        businessId: ctx.business.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const product = await db.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "DELETE",
      entity: "Product",
      entityId: product.id,
      details: { name: existing.name },
    });

    return NextResponse.json(product);
  } catch (error) {
    return handleApiError(error, "DELETE /api/products/[id]");
  }
}
