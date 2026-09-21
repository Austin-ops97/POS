import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canOpenImport } from "@/lib/import/access";
import { IMPORT_BYTE_LIMIT } from "@/lib/import/import-plan";
import { createImportBatch, parseUpload } from "@/lib/import/import-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!canOpenImport(ctx)) throw new Error("Missing permission: import_data");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Invalid import: choose a file");
    if (file.size > IMPORT_BYTE_LIMIT) throw new Error("Invalid import: file is larger than 1.5 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    const table = await parseUpload(file.name || "import.csv", bytes);
    const batch = await createImportBatch({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      fileName: file.name || "import.csv",
      table,
    });
    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/import/batches");
  }
}
