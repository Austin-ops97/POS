import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { listBudgetsWithProgress, upsertBudget } from "@/lib/expenses/budget-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS) &&
      !hasPermission(ctx, PERMISSIONS.MANAGE_EXPENSE_BUDGETS)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_EXPENSE_REPORTS}`);
    }
    const budgets = await listBudgetsWithProgress(ctx);
    return NextResponse.json(budgets);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/budgets");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const budget = await upsertBudget(ctx, body, getClientIp(request));
    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/budgets");
  }
}
