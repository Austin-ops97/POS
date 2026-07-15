import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachReceipt } from "@/lib/expenses/receipt-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const rl = checkRateLimit(`expense:receipt:${ctx.employee.id}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many uploads", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    const { id } = await params;
    const body = await request.json();
    const result = await attachReceipt(ctx, id, body, getClientIp(request));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/[id]/receipts");
  }
}
