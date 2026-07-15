import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { PERMISSIONS } from "@/lib/permissions";
import { createExpense, listExpenses } from "@/lib/expenses/expense-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_OWN_EXPENSES}`);
    }
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());
    const result = await listExpenses(ctx, query);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const ip = getClientIp(request);
    const rl = checkRateLimit(`expense:create:${ctx.business.id}:${ctx.employee.id}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    const body = await request.json();
    const result = await createExpense(ctx, body, ip);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses");
  }
}
