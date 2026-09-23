import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { getDigitalCard, updateDigitalCard } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const card = await getDigitalCard(ctx, id);
    if (!card) throw new Error("Card not found");
    return NextResponse.json(card);
  } catch (error) {
    return handleApiError(error, "GET /api/office/cards/[id]");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const card = await updateDigitalCard(ctx, id, await request.json(), getClientIp(request));
    return NextResponse.json(card);
  } catch (error) {
    return handleApiError(error, "PATCH /api/office/cards/[id]");
  }
}
