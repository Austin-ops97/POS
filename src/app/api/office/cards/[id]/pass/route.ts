import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { publicCardUrl, requestOrigin } from "@/lib/office/digital-cards/access";
import { createBusinessCardPass, PasskitConfigError } from "@/lib/office/digital-cards/passkit";
import { getDigitalCard } from "@/lib/office/digital-cards/service";
import { vCardFilename } from "@/lib/office/digital-cards/vcard";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const card = await getDigitalCard(ctx, id);
    if (!card?.slug || card.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Publish the card before creating an Apple Wallet pass.", code: "NOT_PUBLISHED" },
        { status: 409 }
      );
    }
    const pass = await createBusinessCardPass({
      serialNumber: card.id,
      publicUrl: publicCardUrl(requestOrigin(request.headers), card.slug),
      businessName: card.businessName,
      personName: card.personName,
      jobTitle: card.jobTitle,
      phone: card.phones.find((phone) => phone.visible)?.number,
      email: card.email,
      website: card.website,
      theme: card.theme,
    });
    const filename = vCardFilename(card.personName).replace(/\.vcf$/, ".pkpass");
    return new NextResponse(new Uint8Array(pass), {
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PasskitConfigError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "PASSKIT_NOT_CONFIGURED",
          missing: error.missing,
        },
        { status: 503 }
      );
    }
    return handleApiError(error, "GET /api/office/cards/[id]/pass");
  }
}
