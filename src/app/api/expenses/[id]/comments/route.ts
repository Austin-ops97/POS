import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { expenseCommentSchema } from "@/lib/validations/expenses";
import { addExpenseComment } from "@/lib/expenses/approval-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = expenseCommentSchema.parse(await request.json());
    const comment = await addExpenseComment(ctx, id, body.body, getClientIp(request));
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/[id]/comments");
  }
}
