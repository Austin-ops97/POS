import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { answerCall } from "@/lib/calls/call-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await answerCall(ctx, id, body));
  } catch (error) {
    if (error instanceof Error && error.message.includes("no longer available")) {
      return NextResponse.json({ error: error.message, code: "CALL_ENDED" }, { status: 409 });
    }
    return handleApiError(error, "POST /api/connections/calls/[id]/answer");
  }
}
