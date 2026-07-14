import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, apiError } from "@/lib/api-utils";
import { inventoryScanApplySchema } from "@/lib/validations/barcode";
import { applyScanSession, ScanSessionError } from "@/lib/inventory-scan";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data = inventoryScanApplySchema.parse(body ?? {});
    const result = await applyScanSession(ctx, id, data);

    if (result.conflicts.length > 0) {
      return NextResponse.json(
        {
          error: "Inventory quantities changed since the session started",
          code: "CONFLICTS",
          conflicts: result.conflicts,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScanSessionError) {
      return apiError(error.message, error.statusCode, { code: error.code });
    }
    return handleApiError(error, "POST /api/inventory/scan-sessions/[id]/apply");
  }
}
