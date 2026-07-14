import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, apiError } from "@/lib/api-utils";
import { inventoryScanSessionCreateSchema } from "@/lib/validations/barcode";
import {
  createScanSession,
  ScanSessionError,
} from "@/lib/inventory-scan";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const data = inventoryScanSessionCreateSchema.parse(body);
    const session = await createScanSession(ctx, data);
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof ScanSessionError) {
      return apiError(error.message, error.statusCode, { code: error.code });
    }
    return handleApiError(error, "POST /api/inventory/scan-sessions");
  }
}
