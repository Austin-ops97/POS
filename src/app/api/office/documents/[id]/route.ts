import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import {
  deleteOfficeDocument,
  getOfficeDocument,
  updateOfficeDocument,
} from "@/lib/office/document-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await getOfficeDocument(ctx, id));
  } catch (error) {
    return handleApiError(error, "GET /api/office/documents/[id]");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    return NextResponse.json(
      await updateOfficeDocument(ctx, id, await request.json(), getClientIp(request))
    );
  } catch (error) {
    return handleApiError(error, "PATCH /api/office/documents/[id]");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await deleteOfficeDocument(ctx, id, getClientIp(request));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "DELETE /api/office/documents/[id]");
  }
}

