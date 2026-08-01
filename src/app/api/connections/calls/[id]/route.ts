import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { getCall } from "@/lib/calls/call-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await getCall(ctx, id));
  } catch (error) {
    return handleApiError(error, "GET /api/connections/calls/[id]");
  }
}
