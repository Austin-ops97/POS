import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { endCall } from "@/lib/calls/call-service";
import { endCallSchema } from "@/lib/validations/calls";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const value = endCallSchema.parse(body) ?? {};
    return NextResponse.json(await endCall(ctx, id, value?.reason));
  } catch (error) {
    return handleApiError(error, "POST /api/connections/calls/[id]/end");
  }
}
