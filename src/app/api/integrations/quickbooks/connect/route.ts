import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canConnectQuickBooks } from "@/lib/import/access";
import { quickBooksConnectUrl } from "@/lib/integrations/quickbooks-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!canConnectQuickBooks(ctx)) throw new Error("Missing permission: manage_locations");
    const url = quickBooksConnectUrl({ businessId: ctx.business.id, employeeId: ctx.employee.id });
    return NextResponse.redirect(url);
  } catch (error) {
    return handleApiError(error, "GET /api/integrations/quickbooks/connect");
  }
}
