import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { requireBuilder } from "@/lib/builder/gate";
import { createBusinessFromBuilder } from "@/lib/builder/provision";
import { listBuilderBusinesses, recordBuilderEvent } from "@/lib/builder/service";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().or(z.literal("")),
  type: z.enum(["RETAIL", "SERVICE", "RENTAL", "RESTAURANT", "HYBRID"]).optional(),
  planKey: z.enum(["STARTER", "PRO", "ENTERPRISE"]),
  ownerName: z.string().trim().max(120).optional().or(z.literal("")),
  ownerEmail: z.string().trim().email().optional().or(z.literal("")),
});

export async function GET(request: Request) {
  try {
    await requireBuilder(request);
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const businesses = await listBuilderBusinesses(q);
    return NextResponse.json({ businesses });
  } catch (error) {
    return handleApiError(error, "GET /api/builder/businesses");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireBuilder(request);
    const data = createSchema.parse(await request.json());
    const created = await createBusinessFromBuilder({
      name: data.name,
      email: data.email || null,
      type: data.type,
      planKey: data.planKey,
      ownerName: data.ownerName || null,
      ownerEmail: data.ownerEmail || null,
    });
    await recordBuilderEvent({
      action: "BUSINESS_CREATE",
      actorUserId: user.id,
      actorEmail: user.email,
      businessId: created.businessId,
      ipAddress: getClientIp(request),
      details: {
        name: data.name,
        planKey: data.planKey,
        ownerInvited: Boolean(data.ownerEmail),
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/builder/businesses");
  }
}
