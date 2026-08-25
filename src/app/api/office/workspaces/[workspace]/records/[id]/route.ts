import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import {
  archiveOfficeWorkspaceRecord,
  restoreOfficeWorkspaceRecord,
  updateOfficeWorkspaceRecord,
} from "@/lib/office/workspace-service";

type Params = { params: Promise<{ workspace: string; id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { workspace, id } = await params;
    return NextResponse.json(
      await updateOfficeWorkspaceRecord(ctx, workspace, id, await request.json(), getClientIp(request))
    );
  } catch (error) {
    return handleApiError(error, "PATCH /api/office/workspaces/[workspace]/records/[id]");
  }
}
export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { workspace, id } = await params;
    await archiveOfficeWorkspaceRecord(ctx, workspace, id, getClientIp(request));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "DELETE /api/office/workspaces/[workspace]/records/[id]");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { workspace, id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "restore") {
      return NextResponse.json({ error: "Only restore is supported" }, { status: 400 });
    }
    return NextResponse.json(
      await restoreOfficeWorkspaceRecord(ctx, workspace, id, getClientIp(request))
    );
  } catch (error) {
    return handleApiError(error, "POST /api/office/workspaces/[workspace]/records/[id]");
  }
}
