import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { issueJoinToken } from "@/lib/calls/call-service";
import { joinTokenSchema } from "@/lib/validations/calls";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`connections:calls:token:${ctx.employee.id}`, 30, 60_000);
    if (!limit.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const value = joinTokenSchema.parse(body) ?? { withVideo: true };
    const result = await issueJoinToken(ctx, id, { withVideo: value.withVideo ?? true });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      return NextResponse.json(
        { error: error.message, code: "CALLS_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    return handleApiError(error, "POST /api/connections/calls/[id]/token");
  }
}
