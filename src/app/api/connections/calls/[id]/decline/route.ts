import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { declineCall } from "@/lib/calls/call-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await declineCall(ctx, id));
  } catch (error) {
    return handleApiError(error, "POST /api/connections/calls/[id]/decline");
  }
}
