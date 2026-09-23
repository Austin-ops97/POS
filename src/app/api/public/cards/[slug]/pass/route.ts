import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { publicCardUrl, requestOrigin } from "@/lib/office/digital-cards/access";
import { normalizeTheme } from "@/lib/office/digital-cards/theme";
import { createBusinessCardPass, PasskitConfigError } from "@/lib/office/digital-cards/passkit";
import { getPublishedDigitalCard } from "@/lib/office/digital-cards/service";
import { vCardFilename } from "@/lib/office/digital-cards/vcard";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  try {
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
      theme: normalizeTheme(card.theme),
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
      const accept = request.headers.get("accept") ?? "";
      if (accept.includes("text/html")) {
        const back = /^[A-Za-z0-9_-]{10,22}$/.test(slug) ? `/c/${slug}` : "/";
        return new NextResponse(walletSetupHtml(back), {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return NextResponse.json(
        { error: "Apple Wallet is not available for this card.", code: "PASSKIT_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    return handleApiError(error, "GET /api/public/cards/[slug]/pass");
  }
}

function walletSetupHtml(back: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apple Wallet</title>
</head>
<body style="margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0f172a;color:#f8fafc;">
  <main style="max-width:28rem;margin:0 auto;padding:2.5rem 1.25rem;">
    <h1 style="font-size:1.5rem;margin:0 0 0.75rem;">Apple Wallet is not available yet</h1>
    <p style="line-height:1.5;color:#cbd5e1;">This card can be saved to Apple Wallet after the Pass Type ID certificate is configured. A pass file is not downloaded until then.</p>
    <p style="margin-top:1.5rem;"><a href="${back}" style="color:#6ee7b7;">Back to the card</a></p>
  </main>
</body>
</html>`;
}

