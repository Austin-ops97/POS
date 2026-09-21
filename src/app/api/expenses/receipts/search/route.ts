import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { receiptLibraryQuerySchema } from "@/lib/validations/expenses";
import { searchReceiptLibrary } from "@/lib/expenses/receipt-library";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_OWN_EXPENSES}`);
    }
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = receiptLibraryQuerySchema.parse(query);
    const items = await searchReceiptLibrary(ctx, filters);
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/receipts/search");
  }
}
