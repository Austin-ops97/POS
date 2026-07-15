import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { processApprovalAction } from "@/lib/expenses/approval-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const expense = await processApprovalAction(ctx, id, body, getClientIp(request));
    return NextResponse.json(expense);
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/[id]/approve");
  }
}
