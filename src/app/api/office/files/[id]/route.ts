import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { deleteOfficeFile, readOfficeFile } from "@/lib/office/file-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const file = await readOfficeFile(ctx, id);
    const dispositionName = file.fileName.replace(/["\\\r\n]/g, "_");
    return new NextResponse(new Uint8Array(file.data!), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.sizeBytes),
        "Content-Disposition": `inline; filename="${dispositionName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/office/files/[id]");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await deleteOfficeFile(ctx, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "DELETE /api/office/files/[id]");
  }
}

