import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { getExpenseDashboard } from "@/lib/expenses/dashboard-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_OWN_EXPENSES}`);
    }
    const data = await getExpenseDashboard(ctx);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/dashboard");
  }
}
