import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { getTaxRatesForLocation } from "@/lib/order-service";
import { PERMISSIONS } from "@/lib/permissions";
import { taxRateSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const locationId =
      searchParams.get("locationId") ?? ctx.location?.id ?? undefined;

    if (isDemoMode()) {
      return NextResponse.json({
        taxRates: [
          {
            name: "Sales Tax",
            rate: 0.0825,
            appliesToProducts: true,
            appliesToServices: true,
          },
        ],
      });
    }

    if (!locationId) {
      return NextResponse.json({ taxRates: [] });
    }

    const taxRates = await getTaxRatesForLocation(
      ctx.business.id,
      locationId
    );

    return NextResponse.json({ taxRates });
  } catch (error) {
    return handleApiError(error, "GET /api/tax-rates");
  }
}

export async function POST(request: Request) {
  try {
    if (isDemoMode()) {
      return NextResponse.json(
        { error: "Tax rates cannot be modified while sample data mode is disabled" },
        { status: 400 }
      );
    }

    const ctx = await requireAuth();
    if (!hasPermission(ctx, PERMISSIONS.MANAGE_LOCATIONS)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const data = taxRateSchema.parse(body);

    if (data.locationId) {
      const location = await db.location.findFirst({
        where: {
          id: data.locationId,
          businessId: ctx.business.id,
          deletedAt: null,
        },
      });
      if (!location) {
        return NextResponse.json({ error: "Location not found" }, { status: 404 });
      }
    }

    const taxRate = await db.taxRate.create({
      data: {
        businessId: ctx.business.id,
        locationId: data.locationId,
        name: data.name,
        rate: data.rate,
        appliesToProducts: data.appliesToProducts ?? true,
        appliesToServices: data.appliesToServices ?? true,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(taxRate, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/tax-rates");
  }
}
