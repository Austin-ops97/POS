import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, apiError } from "@/lib/api-utils";
import { removeScanLine, ScanSessionError } from "@/lib/inventory-scan";

type RouteParams = { params: Promise<{ id: string; lineId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id: sessionId, lineId } = await params;
    const result = await removeScanLine(ctx, sessionId, lineId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScanSessionError) {
      return apiError(error.message, error.statusCode, { code: error.code });
    }
    return handleApiError(
      error,
      "DELETE /api/inventory/scan-sessions/[id]/lines/[lineId]"
    );
  }
}
