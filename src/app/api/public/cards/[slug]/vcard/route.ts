import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { buildDigitalCardVCard, vCardFilename } from "@/lib/office/digital-cards/vcard";
import { getPublishedDigitalCard } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const ip = getClientIp(request) ?? "unknown";
    const rateLimit = await checkRateLimitAsync(`public-card-vcard:${slug}:${ip}`, 30, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const card = await getPublishedDigitalCard(slug);
    if (!card) return NextResponse.json({ error: "Card not found", code: "NOT_FOUND" }, { status: 404 });
    const body = buildDigitalCardVCard({
      personName: card.personName,
      businessName: card.businessName,
      jobTitle: card.jobTitle,
      email: card.email,
      website: card.website,
      note: card.note,
      phones: card.phones.filter((phone) => phone.visible).map((phone) => ({ label: phone.label, number: phone.number })),
      addresses: card.addresses.filter((address) => address.visible),
      socialLinks: card.socialLinks
        .filter((link) => link.visible)
        .map((link) => ({ network: link.network, label: link.label, url: link.url })),
    });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${vCardFilename(card.personName)}"`,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/public/cards/[slug]/vcard");
  }
}
