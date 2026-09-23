import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { requestOrigin } from "@/lib/office/digital-cards/access";
import { renderCardQrPng } from "@/lib/office/digital-cards/qr";
import { getPublishedDigitalCard } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const card = await getPublishedDigitalCard(slug);
    if (!card?.slug) return NextResponse.json({ error: "Card not found", code: "NOT_FOUND" }, { status: 404 });
    const { png } = await renderCardQrPng(requestOrigin(request.headers), card.slug);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/public/cards/[slug]/qr");
  }
}
