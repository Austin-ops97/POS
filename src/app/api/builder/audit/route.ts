import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { requireBuilder } from "@/lib/builder/gate";
import { listBuilderAudit } from "@/lib/builder/service";

export async function GET(request: Request) {
  try {
    await requireBuilder(request);
    const businessId = new URL(request.url).searchParams.get("businessId");
    const events = await listBuilderAudit(businessId);
    return NextResponse.json({ events });
  } catch (error) {
    return handleApiError(error, "GET /api/builder/audit");
  }
}
