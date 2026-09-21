import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { requireBuilder } from "@/lib/builder/gate";
import { updateBusinessChecklist } from "@/lib/builder/service";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z
  .object({
    businessReady: z.boolean().optional(),
    planApplied: z.boolean().optional(),
    featuresReviewed: z.boolean().optional(),
    integrationsConfirmed: z.boolean().optional(),
    ownerInvited: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => typeof item === "boolean"), {
    message: "Choose a checklist step",
  });

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireBuilder(request);
    const { id } = await params;
    const data = schema.parse(await request.json());
    await updateBusinessChecklist({
      businessId: id,
      patch: data,
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/builder/businesses/[id]/checklist");
  }
}
