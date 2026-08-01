import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { startCall } from "@/lib/calls/call-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`connections:calls:start:${ctx.employee.id}`, 10, 60_000);
    if (!limit.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const call = await startCall(ctx, await request.json());
    return NextResponse.json(call, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      return NextResponse.json(
        { error: error.message, code: "CALLS_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    if (error instanceof Error && error.message.includes("already active")) {
      const callId =
        typeof (error as Error & { callId?: string }).callId === "string"
          ? (error as Error & { callId?: string }).callId
          : undefined;
      return NextResponse.json(
        { error: error.message, code: "CALL_ACTIVE", callId },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message.includes("disabled")) {
      return NextResponse.json({ error: error.message, code: "FEATURE_DISABLED" }, { status: 403 });
    }
    return handleApiError(error, "POST /api/connections/calls");
  }
}
