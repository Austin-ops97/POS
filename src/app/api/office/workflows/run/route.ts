import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { createOfficeWorkspaceRecord, updateOfficeWorkspaceRecord } from "@/lib/office/workspace-service";

const schema = z.object({ recordId: z.string().cuid(), confirmed: z.literal(true) });
type WorkflowData = { kind: "workflow"; action: "CREATE_PROJECT" | "CREATE_DRAFT"; outputTitle: string; outputSummary: string; runs?: Array<{ at: string; outputId: string; workspace: string }> };

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:workflow:run:${ctx.employee.id}`, 20, 60_000);
    if (!limit.ok) return jsonError("Too many workflow runs. Wait a minute and try again.", 429);
    const input = schema.parse(await request.json());
    const workflow = await db.officeWorkspaceRecord.findFirst({ where: { id: input.recordId, workspace: "automations-ai", businessId: ctx.business.id, archivedAt: null } });
    if (!workflow) return jsonError("Workflow not found", 404);
    const metadata = workflow.metadata as WorkflowData | null;
    if (!metadata || metadata.kind !== "workflow") return jsonError("Workflow configuration is invalid", 400);
    const workspace = metadata.action === "CREATE_PROJECT" ? "projects" : "communication";
    const output = await createOfficeWorkspaceRecord(ctx, workspace, {
      title: metadata.outputTitle,
      summary: metadata.outputSummary,
      status: metadata.action === "CREATE_DRAFT" ? "DRAFT" : "ACTIVE",
      priority: "NORMAL",
      metadata: metadata.action === "CREATE_PROJECT"
        ? { tasks: [], color: "amber", createdByWorkflowId: workflow.id }
        : { kind: "email", to: "", subject: metadata.outputTitle, body: metadata.outputSummary, createdByWorkflowId: workflow.id },
    }, getClientIp(request));
    const run = { at: new Date().toISOString(), outputId: output.id, workspace };
    await updateOfficeWorkspaceRecord(ctx, "automations-ai", workflow.id, { metadata: { ...metadata, runs: [run, ...(metadata.runs ?? [])].slice(0, 25) } }, getClientIp(request));
    return NextResponse.json({ success: true, output, workspace });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("A confirmed workflow is required", 400);
    return handleApiError(error, "POST /api/office/workflows/run");
  }
}
