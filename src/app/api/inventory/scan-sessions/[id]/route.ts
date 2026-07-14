import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, apiError } from "@/lib/api-utils";
import {
  cancelScanSession,
  getScanSession,
  ScanSessionError,
} from "@/lib/inventory-scan";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const session = await getScanSession(ctx, id);
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof ScanSessionError) {
      return apiError(error.message, error.statusCode, { code: error.code });
    }
    return handleApiError(error, "GET /api/inventory/scan-sessions/[id]");
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const session = await cancelScanSession(ctx, id);
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof ScanSessionError) {
      return apiError(error.message, error.statusCode, { code: error.code });
    }
    return handleApiError(error, "DELETE /api/inventory/scan-sessions/[id]");
  }
}
