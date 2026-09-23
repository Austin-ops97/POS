import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { publicCardUrl, requestOrigin } from "@/lib/office/digital-cards/access";
import { createBusinessCardPass, PasskitConfigError } from "@/lib/office/digital-cards/passkit";
import { getPublishedDigitalCard } from "@/lib/office/digital-cards/service";
import { vCardFilename } from "@/lib/office/digital-cards/vcard";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const card = await getPublishedDigitalCard(slug);
    if (!card?.slug) return NextResponse.json({ error: "Card not found", code: "NOT_FOUND" }, { status: 404 });
    const pass = await createBusinessCardPass({
      serialNumber: card.id,
      publicUrl: publicCardUrl(requestOrigin(request.headers), card.slug),
      businessName: card.businessName,
      personName: card.personName,
      jobTitle: card.jobTitle,
      phone: card.phones.find((phone) => phone.visible)?.number,
      email: card.email,
      website: card.website,
      theme: normalizeThemeSafe(card.theme),
    });
    const filename = vCardFilename(card.personName).replace(/\.vcf$/, ".pkpass");
    return new NextResponse(new Uint8Array(pass), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PasskitConfigError) {
      return NextResponse.json(
        { error: "Apple Wallet is not available for this card.", code: "PASSKIT_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    return handleApiError(error, "GET /api/public/cards/[slug]/pass");
  }
}

function normalizeThemeSafe(theme: unknown) {
  const raw = theme && typeof theme === "object" ? (theme as Record<string, unknown>) : {};
  return {
    accent: String(raw.accent ?? "#34d399"),
    gradientFrom: String(raw.gradientFrom ?? "#042f2e"),
    gradientTo: String(raw.gradientTo ?? "#0f172a"),
  };
}
