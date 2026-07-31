import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createOfficeTag, listOfficeTags } from "@/lib/office/folder-service";

export async function GET() {
  try {
    return NextResponse.json(await listOfficeTags(await requireAuth()));
  } catch (error) {
    return handleApiError(error, "GET /api/office/tags");
  }
}

export async function POST(request: Request) {
  try {
    const tag = await createOfficeTag(await requireAuth(), await request.json());
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/tags");
  }
}
