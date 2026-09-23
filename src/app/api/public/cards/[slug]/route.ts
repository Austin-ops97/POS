import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getPublishedDigitalCard, toPublicCard } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const ip = getClientIp(request) ?? "unknown";
    const rateLimit = await checkRateLimitAsync(`public-card:${slug}:${ip}`, 60, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const card = await getPublishedDigitalCard(slug);
    const pub = card ? toPublicCard(card) : null;
    if (!pub) return NextResponse.json({ error: "Card not found", code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(pub);
  } catch (error) {
    return handleApiError(error, "GET /api/public/cards/[slug]");
  }
}
