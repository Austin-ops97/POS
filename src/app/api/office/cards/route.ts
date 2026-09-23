import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createDigitalCard, listDigitalCards } from "@/lib/office/digital-cards/service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await listDigitalCards(ctx));
  } catch (error) {
    return handleApiError(error, "GET /api/office/cards");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const rateLimit = await checkRateLimitAsync(`office:card:${ctx.employee.id}`, 30, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const body = await request.json().catch(() => ({}));
    const card = await createDigitalCard(ctx, body, getClientIp(request));
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/cards");
  }
}
