import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { saveTaxMapping } from "@/lib/banking/banking-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json().catch(() => null)) as { categoryId?: string; taxLabel?: string } | null;
    if (!body?.categoryId || body.taxLabel == null) throw new Error("Invalid mapping: category and label are required");
    return NextResponse.json(await saveTaxMapping(ctx, { categoryId: body.categoryId, taxLabel: body.taxLabel }));
  } catch (error) {
    return handleApiError(error, "POST /api/finance/tax-mappings");
  }
}
