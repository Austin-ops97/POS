import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canConnectQuickBooks } from "@/lib/import/access";
import { quickBooksStatus } from "@/lib/integrations/quickbooks-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!canConnectQuickBooks(ctx)) throw new Error("Missing permission: manage_bank");
    return NextResponse.json(await quickBooksStatus(ctx.business.id));
  } catch (error) {
    return handleApiError(error, "GET /api/integrations/quickbooks");
  }
}
