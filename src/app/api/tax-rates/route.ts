import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { handleApiError } from "@/lib/api-utils";
import { getTaxRatesForLocation } from "@/lib/order-service";

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
