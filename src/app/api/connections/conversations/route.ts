import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createConversation, listConversations } from "@/lib/connections/service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(request.url).searchParams.get("q") || "";
    return NextResponse.json(await listConversations(ctx, { q }));
  } catch (error) {
    return handleApiError(error, "GET /api/connections/conversations");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`connections:create:${ctx.employee.id}`, 20, 60_000);
    if (!limit.ok) return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    return NextResponse.json(await createConversation(ctx, await request.json()), { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/connections/conversations");
  }
}
