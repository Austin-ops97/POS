import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { listApprovalQueue } from "@/lib/office/completion-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await listApprovalQueue(ctx));
  } catch (error) {
    return handleApiError(error, "GET /api/office/approvals");
  }
}
