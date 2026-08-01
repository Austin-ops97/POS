import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reviewSubmission } from "@/lib/office/completion-service";

type Params = { params: Promise<{ submissionId: string }> };

const schema = z.object({
  action: z.enum(["APPROVE", "CHANGES_REQUESTED", "REJECT"]),
  comment: z.string().trim().max(2_000).optional().nullable(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:approval:review:${ctx.employee.id}`, 40, 60_000);
    if (!limit.ok) return jsonError("Too many reviews. Wait a minute and try again.", 429);
    const { submissionId } = await params;
    const body = schema.parse(await request.json());
    return NextResponse.json(await reviewSubmission(ctx, submissionId, body));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError(error.issues[0]?.message ?? "Invalid review", 400);
    return handleApiError(error, "POST /api/office/approvals/[submissionId]/review");
  }
}
