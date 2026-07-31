import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { toggleReaction } from "@/lib/connections/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await toggleReaction(ctx, id, await request.json()));
  } catch (error) {
    return handleApiError(error, "POST /api/connections/messages/[id]/reactions");
  }
}
