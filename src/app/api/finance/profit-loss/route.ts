import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { profitAndLossReport } from "@/lib/banking/banking-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(request.url);
    return NextResponse.json(
      await profitAndLossReport(ctx, {
        preset: url.searchParams.get("preset") || undefined,
        from: url.searchParams.get("from") || undefined,
        to: url.searchParams.get("to") || undefined,
        category: url.searchParams.get("category") || undefined,
      }),
    );
  } catch (error) {
    return handleApiError(error, "GET /api/finance/profit-loss");
  }
}
