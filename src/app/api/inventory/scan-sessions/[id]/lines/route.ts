import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, apiError } from "@/lib/api-utils";
import {
  inventoryScanLineAddSchema,
  inventoryScanLineEditSchema,
} from "@/lib/validations/barcode";
import {
  addScanLine,
  ScanSessionError,
  updateScanLine,
} from "@/lib/inventory-scan";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const data = inventoryScanLineAddSchema.parse(body);
    const line = await addScanLine(ctx, id, data);
    return NextResponse.json(line, { status: 201 });
  } catch (error) {
    if (error instanceof ScanSessionError) {
      return apiError(error.message, error.statusCode, { code: error.code });
    }
    return handleApiError(error, "POST /api/inventory/scan-sessions/[id]/lines");
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id: sessionId } = await params;
    const body = await request.json();
    const { lineId, ...rest } = body as { lineId?: string };
    if (!lineId) {
      return apiError("lineId is required", 400, { code: "VALIDATION_ERROR" });
    }
    const data = inventoryScanLineEditSchema.parse(rest);
    const line = await updateScanLine(ctx, sessionId, lineId, data.scannedQty);
    return NextResponse.json(line);
  } catch (error) {
    if (error instanceof ScanSessionError) {
      return apiError(error.message, error.statusCode, { code: error.code });
    }
    return handleApiError(error, "PATCH /api/inventory/scan-sessions/[id]/lines");
  }
}
