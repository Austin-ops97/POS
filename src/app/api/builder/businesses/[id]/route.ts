import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { requireBuilder } from "@/lib/builder/gate";
import { getBuilderBusiness } from "@/lib/builder/service";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    await requireBuilder(request);
    const { id } = await params;
    return NextResponse.json(await getBuilderBusiness(id));
  } catch (error) {
    return handleApiError(error, "GET /api/builder/businesses/[id]");
  }
}
