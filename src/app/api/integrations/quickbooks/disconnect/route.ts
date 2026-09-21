import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canConnectQuickBooks } from "@/lib/import/access";
import { disconnectQuickBooks } from "@/lib/integrations/quickbooks-service";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!canConnectQuickBooks(ctx)) throw new Error("Missing permission: manage_bank");
    return NextResponse.json(await disconnectQuickBooks({ businessId: ctx.business.id, employeeId: ctx.employee.id }));
  } catch (error) {
    return handleApiError(error, "POST /api/integrations/quickbooks/disconnect");
  }
}
