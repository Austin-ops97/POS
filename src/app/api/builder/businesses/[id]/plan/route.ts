import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { requireBuilder } from "@/lib/builder/gate";
import { BUILDER_PLAN_KEYS } from "@/lib/builder/plans";
import { applyBusinessPlan } from "@/lib/builder/service";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({ planKey: z.enum(BUILDER_PLAN_KEYS) });

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireBuilder(request);
    const { id } = await params;
    const data = schema.parse(await request.json());
    await applyBusinessPlan({
      businessId: id,
      planKey: data.planKey,
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "POST /api/builder/businesses/[id]/plan");
  }
}
