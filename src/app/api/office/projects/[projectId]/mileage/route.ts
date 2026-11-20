import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireModule } from "@/lib/access-control";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { drivingMiles } from "@/lib/office/project-mileage";
import { updateOfficeWorkspaceRecord } from "@/lib/office/workspace-service";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    await requireModule(ctx, "PROJECTS");
    const { projectId } = await params;
    const body = (await request.json()) as { origin?: string; destination?: string };
    const origin = String(body.origin ?? "").trim();
    const destination = String(body.destination ?? "").trim();
    const miles = await drivingMiles(origin, destination);
    const current = await db.officeWorkspaceRecord.findFirst({
      where: { id: projectId, workspace: "projects", businessId: ctx.business.id, archivedAt: null },
    });
    if (!current) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const metadata = {
      ...((current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata
        : {}) as Record<string, unknown>),
      originAddress: origin,
      destinationAddress: destination,
      mileageMiles: miles,
    };
    const saved = await updateOfficeWorkspaceRecord(
      ctx,
      "projects",
      projectId,
      { metadata },
      getClientIp(request)
    );
    return NextResponse.json({ miles, record: saved });
  } catch (error) {
    return handleApiError(error, "POST /api/office/projects/[projectId]/mileage");
  }
}
