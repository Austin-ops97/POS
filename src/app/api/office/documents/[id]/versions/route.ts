import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { createOfficeDocumentVersion } from "@/lib/office/document-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const version = await createOfficeDocumentVersion(
      ctx,
      id,
      await request.json(),
      getClientIp(request)
    );
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/documents/[id]/versions");
  }
}

