import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import {
  createOfficeWorkspaceRecord,
  listOfficeWorkspaceRecords,
} from "@/lib/office/workspace-service";

type Params = { params: Promise<{ workspace: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { workspace } = await params;
    const search = new URL(request.url).searchParams;
    return NextResponse.json(
      await listOfficeWorkspaceRecords(ctx, workspace, {
        q: search.get("q") ?? undefined,
        includeComplete: search.get("includeComplete") === "true",
      })
    );
  } catch (error) {
    return handleApiError(error, "GET /api/office/workspaces/[workspace]/records");
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const rateLimit = await checkRateLimitAsync(`office:workspace:create:${ctx.employee.id}`, 60, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const { workspace } = await params;
    const record = await createOfficeWorkspaceRecord(
      ctx,
      workspace,
      await request.json(),
      getClientIp(request)
    );
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/workspaces/[workspace]/records");
  }
}
