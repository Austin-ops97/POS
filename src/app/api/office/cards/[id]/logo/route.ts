import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { digitalCardLogoSchema } from "@/lib/validations/digital-cards";
import { clearDigitalCardLogo, getCardLogo, getDigitalCard, setDigitalCardLogo } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ id: string }> };

function imageResponse(logo: { logoUrl: string | null; logoMime: string | null; logoData: Uint8Array | null }) {
  if (logo.logoUrl?.startsWith("https://")) return NextResponse.redirect(logo.logoUrl);
  if (!logo.logoData || !logo.logoMime) {
    return NextResponse.json({ error: "Logo not found", code: "NOT_FOUND" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(logo.logoData), {
    headers: { "Content-Type": logo.logoMime, "Cache-Control": "private, max-age=300" },
  });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const visible = await getDigitalCard(ctx, id);
    if (!visible) throw new Error("Card not found");
    const logo = await getCardLogo(id, ctx.business.id);
    if (!logo) throw new Error("Card not found");
    return imageResponse(logo);
  } catch (error) {
    return handleApiError(error, "GET /api/office/cards/[id]/logo");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = digitalCardLogoSchema.parse(await request.json());
    return NextResponse.json(await setDigitalCardLogo(ctx, id, body.dataUrl, getClientIp(request)));
  } catch (error) {
    return handleApiError(error, "POST /api/office/cards/[id]/logo");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await clearDigitalCardLogo(ctx, id, getClientIp(request)));
  } catch (error) {
    return handleApiError(error, "DELETE /api/office/cards/[id]/logo");
  }
}
