import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { handleApiError, apiError } from "@/lib/api-utils";
import {
  isUsableBarcode,
  normalizeBarcode,
} from "@/lib/barcodes";
import { findBarcodeAssignment } from "@/lib/product-barcode";
import { lookupExternalProduct } from "@/lib/product-lookup/service";
import { barcodeLookupQuerySchema } from "@/lib/validations/barcode";
import { checkRateLimit } from "@/lib/rate-limit";
import type {
  BarcodeLookupResponse,
  InventorySummary,
} from "@/lib/barcode-lookup-types";

type RouteParams = { params: Promise<{ barcode: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const canView =
      hasPermission(ctx, PERMISSIONS.VIEW_PRODUCTS) ||
      hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS) ||
      hasPermission(ctx, PERMISSIONS.VIEW_INVENTORY) ||
      hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY) ||
      hasPermission(ctx, PERMISSIONS.PROCESS_SALE) ||
      hasPermission(ctx, PERMISSIONS.OPEN_REGISTER);

    if (!canView) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_PRODUCTS}`);
    }

    const rate = checkRateLimit(
      `barcode-lookup:${ctx.business.id}:${ctx.employee.id}`,
      120,
      60_000
    );
    if (!rate.ok) {
      return apiError("Too many barcode lookups. Try again shortly.", 429, {
        code: "RATE_LIMITED",
      });
    }

    const { barcode: encoded } = await params;
    const rawBarcode = decodeURIComponent(encoded);
    const { searchParams } = new URL(request.url);
    const query = barcodeLookupQuerySchema.parse({
      locationId: searchParams.get("locationId") ?? undefined,
      localOnly: searchParams.get("localOnly") ?? undefined,
    });

    const barcode = normalizeBarcode(rawBarcode);
    if (!isUsableBarcode(barcode)) {
      return NextResponse.json(
        { status: "NOT_FOUND", barcode } satisfies BarcodeLookupResponse
      );
    }

    const assignment = await findBarcodeAssignment(
      db,
      ctx.business.id,
      barcode
    );

    if (assignment) {
      let inventory: InventorySummary | null = null;
      if (query.locationId) {
        const location = await db.location.findFirst({
          where: {
            id: query.locationId,
            businessId: ctx.business.id,
            deletedAt: null,
          },
        });
        if (!location) {
          return apiError("Location not found", 404, { code: "NOT_FOUND" });
        }

        const item = await db.inventoryItem.findFirst({
          where: {
            businessId: ctx.business.id,
            locationId: query.locationId,
            productId: assignment.productId,
          },
        });
        if (item) {
          inventory = {
            id: item.id,
            locationId: item.locationId,
            quantityOnHand: item.quantityOnHand,
            quantityReserved: item.quantityReserved,
            reorderPoint: item.reorderPoint,
          };
        }
      }

      const product = assignment.product;
      const response: BarcodeLookupResponse = {
        status: "LOCAL_MATCH",
        barcode,
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          brand: product.brand,
          price: Number(product.price),
          cost: product.cost != null ? Number(product.cost) : null,
          taxable: product.taxable,
          trackInventory: product.trackInventory,
          imageUrl: product.imageUrl,
          categoryId: product.categoryId,
          categoryName: product.category?.name ?? null,
        },
        variant: assignment.variant
          ? {
              id: assignment.variant.id,
              name: assignment.variant.name,
              sku: assignment.variant.sku,
              barcode: assignment.variant.barcode,
              price:
                assignment.variant.price != null
                  ? Number(assignment.variant.price)
                  : null,
            }
          : null,
        inventory,
      };
      return NextResponse.json(response);
    }

    // Register / checkout: never call external catalog
    if (query.localOnly) {
      return NextResponse.json(
        { status: "NOT_FOUND", barcode } satisfies BarcodeLookupResponse
      );
    }

    const canExternal =
      hasPermission(ctx, PERMISSIONS.VIEW_PRODUCTS) ||
      hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS) ||
      hasPermission(ctx, PERMISSIONS.VIEW_INVENTORY) ||
      hasPermission(ctx, PERMISSIONS.MANAGE_INVENTORY);

    if (!canExternal || barcode.skipExternalLookup) {
      return NextResponse.json(
        { status: "NOT_FOUND", barcode } satisfies BarcodeLookupResponse
      );
    }

    const externalRate = checkRateLimit(
      `barcode-external:${ctx.business.id}`,
      30,
      60_000
    );
    if (!externalRate.ok) {
      return NextResponse.json(
        { status: "NOT_FOUND", barcode } satisfies BarcodeLookupResponse
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const external = await lookupExternalProduct(barcode, controller.signal);
      if (external) {
        return NextResponse.json({
          status: "EXTERNAL_MATCH",
          barcode,
          externalProduct: external,
        } satisfies BarcodeLookupResponse);
      }
    } finally {
      clearTimeout(timeout);
    }

    return NextResponse.json(
      { status: "NOT_FOUND", barcode } satisfies BarcodeLookupResponse
    );
  } catch (error) {
    return handleApiError(error, "GET /api/catalog/barcodes/[barcode]");
  }
}
