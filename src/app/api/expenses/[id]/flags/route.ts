import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { PERMISSIONS } from "@/lib/permissions";
import { processApprovalAction } from "@/lib/expenses/approval-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_EXPENSES}`);
    }
    const { id } = await params;
    const body = await request.json();
    const expense = await processApprovalAction(
      ctx,
      id,
      { action: "FLAG", note: body.note, flagMessage: body.message ?? body.flagMessage },
      getClientIp(request)
    );
    return NextResponse.json(expense);
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/[id]/flags");
  }
}
