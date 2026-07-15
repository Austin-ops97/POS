import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import {
  getExpenseById,
  softDeleteExpense,
  updateExpense,
} from "@/lib/expenses/expense-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const expense = await getExpenseById(ctx, id);
    if (!expense) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(expense);
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/[id]");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const expense = await updateExpense(ctx, id, body, getClientIp(request));
    return NextResponse.json(expense);
  } catch (error) {
    return handleApiError(error, "PATCH /api/expenses/[id]");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const expense = await softDeleteExpense(ctx, id, getClientIp(request));
    return NextResponse.json(expense);
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/[id]");
  }
}
