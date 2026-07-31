import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { listMessages, sendMessage } from "@/lib/connections/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await listMessages(ctx, id));
  } catch (error) {
    return handleApiError(error, "GET /api/connections/conversations/[id]/messages");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`connections:message:${ctx.employee.id}`, 120, 60_000);
    if (!limit.ok) return NextResponse.json({ error: "Too many messages", code: "RATE_LIMITED" }, { status: 429 });
    const { id } = await params;
    return NextResponse.json(await sendMessage(ctx, id, await request.json()), { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/connections/conversations/[id]/messages");
  }
}
