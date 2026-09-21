import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canOpenImport } from "@/lib/import/access";
import { previewImportBatch } from "@/lib/import/import-service";

const schema = z.object({
  entityType: z.string().min(1).max(40),
  mapping: z.record(z.string(), z.string().nullable()),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!canOpenImport(ctx)) throw new Error("Missing permission: import_data");
    const { id } = await params;
    const data = schema.parse(await request.json());
    const preview = await previewImportBatch({
      businessId: ctx.business.id,
      batchId: id,
      entityType: data.entityType,
      mapping: data.mapping,
    });
    return NextResponse.json(preview);
  } catch (error) {
    return handleApiError(error, "POST /api/import/batches/[id]/preview");
  }
}
