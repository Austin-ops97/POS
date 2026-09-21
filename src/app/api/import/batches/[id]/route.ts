import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canOpenImport } from "@/lib/import/access";
import { getImportBatch } from "@/lib/import/import-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!canOpenImport(ctx)) throw new Error("Missing permission: manage_locations");
    const { id } = await params;
    const batch = await getImportBatch(ctx.business.id, id);
    if (!batch) throw new Error("Import batch not found");
    return NextResponse.json(batch);
  } catch (error) {
    return handleApiError(error, "GET /api/import/batches/[id]");
  }
}
