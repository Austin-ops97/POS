import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { publishDigitalCard } from "@/lib/office/digital-cards/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await publishDigitalCard(ctx, id, getClientIp(request)));
  } catch (error) {
    return handleApiError(error, "POST /api/office/cards/[id]/publish");
  }
}
