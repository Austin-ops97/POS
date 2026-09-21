import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canOpenImport } from "@/lib/import/access";
import { importErrorReport } from "@/lib/import/import-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!canOpenImport(ctx)) throw new Error("Missing permission: manage_locations");
    const { id } = await params;
    const csv = await importErrorReport(ctx.business.id, id);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="import-${id}-errors.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/import/batches/[id]/errors");
  }
}
