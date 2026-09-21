import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { assertImportEntity, canOpenImport } from "@/lib/import/access";
import { commitImportBatch, getImportBatch } from "@/lib/import/import-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!canOpenImport(ctx)) throw new Error("Missing permission: manage_locations");
    const { id } = await params;
    const existing = await getImportBatch(ctx.business.id, id);
    if (!existing) throw new Error("Import batch not found");
    assertImportEntity(ctx, existing.entityType);
    const result = await commitImportBatch({ businessId: ctx.business.id, employeeId: ctx.employee.id, batchId: id });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/import/batches/[id]/commit");
  }
}
