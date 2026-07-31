import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { reorderOfficeFiles } from "@/lib/office/file-service";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await reorderOfficeFiles(ctx, id, await request.json()));
  } catch (error) {
    return handleApiError(error, "PUT /api/office/documents/[id]/files/reorder");
  }
}

