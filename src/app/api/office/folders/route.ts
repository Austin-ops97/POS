import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createOfficeFolder, listOfficeFolders } from "@/lib/office/folder-service";

export async function GET() {
  try {
    return NextResponse.json(await listOfficeFolders(await requireAuth()));
  } catch (error) {
    return handleApiError(error, "GET /api/office/folders");
  }
}

export async function POST(request: Request) {
  try {
    const folder = await createOfficeFolder(await requireAuth(), await request.json());
    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/folders");
  }
}

