import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { listSubmissions } from "@/lib/office/completion-service";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { projectId } = await params;
    return NextResponse.json(await listSubmissions(ctx, projectId));
  } catch (error) {
    return handleApiError(error, "GET /api/office/projects/[projectId]/submissions");
  }
}
