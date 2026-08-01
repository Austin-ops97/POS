import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { reopenProject } from "@/lib/office/completion-service";

type Params = { params: Promise<{ projectId: string }> };

const schema = z.object({
  comment: z.string().trim().max(2_000).optional().nullable(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { projectId } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await reopenProject(ctx, projectId, body.comment));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid request", 400);
    return handleApiError(error, "POST /api/office/projects/[projectId]/reopen");
  }
}
