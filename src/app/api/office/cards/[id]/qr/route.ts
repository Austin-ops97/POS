import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { requestOrigin } from "@/lib/office/digital-cards/access";
import { renderCardQrPng } from "@/lib/office/digital-cards/qr";
import { getDigitalCard } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const card = await getDigitalCard(ctx, id);
    if (!card) throw new Error("Card not found");
    if (!card.slug || card.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Publish the card before downloading a QR code.", code: "NOT_PUBLISHED" },
        { status: 409 }
      );
    }
    const { png } = await renderCardQrPng(requestOrigin(request.headers), card.slug);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
        ...(download ? { "Content-Disposition": 'attachment; filename="business-card-qr.png"' } : {}),
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/office/cards/[id]/qr");
  }
}
