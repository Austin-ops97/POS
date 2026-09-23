import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { getPublishedCardLogo } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const logo = await getPublishedCardLogo(slug);
    if (!logo) return NextResponse.json({ error: "Card not found", code: "NOT_FOUND" }, { status: 404 });
    if (logo.logoUrl?.startsWith("https://")) return NextResponse.redirect(logo.logoUrl);
    if (!logo.logoData || !logo.logoMime) {
      return NextResponse.json({ error: "Logo not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(logo.logoData), {
      headers: { "Content-Type": logo.logoMime, "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/public/cards/[slug]/logo");
  }
}
