import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { ensurePaidSubscription } from "@/lib/subscription-server";
import { productSchema } from "@/lib/validations";
import { PERMISSIONS } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);
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
    await ensurePaidSubscription(ctx);

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

    const product = await db.product.update({
      where: { id },
      data: {
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

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "UPDATE",
      entity: "Product",
      entityId: product.id,
      details: data,
    });

    return NextResponse.json(product);
  } catch (error) {
    return handleApiError(error, "PATCH /api/products/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    await ensurePaidSubscription(ctx);

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
