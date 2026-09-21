import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { requireBuilder } from "@/lib/builder/gate";
import { setBusinessFeature } from "@/lib/builder/service";
import { MODULE_SETTING_KEYS } from "@/lib/validations";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  module: z.enum(MODULE_SETTING_KEYS),
  enabled: z.boolean(),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await requireBuilder(request);
    const { id } = await params;
    const data = schema.parse(await request.json());
    await setBusinessFeature({
      businessId: id,
      module: data.module,
      enabled: data.enabled,
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "PATCH /api/builder/businesses/[id]/features");
  }
}
