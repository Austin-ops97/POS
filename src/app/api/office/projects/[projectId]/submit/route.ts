import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { submitForApproval } from "@/lib/office/completion-service";

type Params = { params: Promise<{ projectId: string }> };

const schema = z.object({
  completionNote: z.string().trim().max(2_000).optional().nullable(),
  supervisorId: z.string().cuid().optional().nullable(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:completion:submit:${ctx.employee.id}`, 20, 60_000);
    if (!limit.ok) return jsonError("Too many submissions. Wait a minute and try again.", 429);
    const { projectId } = await params;
    const body = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await submitForApproval(ctx, projectId, body), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid submission", 400);
    return handleApiError(error, "POST /api/office/projects/[projectId]/submit");
  }
}
