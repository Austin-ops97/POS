import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { deleteAttachment } from "@/lib/office/completion-service";

type Params = { params: Promise<{ projectId: string; id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { projectId, id } = await params;
    return NextResponse.json(await deleteAttachment(ctx, projectId, id));
  } catch (error) {
    return handleApiError(error, "DELETE /api/office/projects/[projectId]/attachments/[id]");
  }
}
