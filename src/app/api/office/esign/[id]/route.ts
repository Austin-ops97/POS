import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { getEsignRequest } from "@/lib/office/esign-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await getEsignRequest(ctx, id));
  } catch (error) {
    return handleApiError(error, "GET /api/office/esign/[id]");
  }
}
