import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { setOfficeFavorite } from "@/lib/office/document-service";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const { favorite } = z.object({ favorite: z.boolean() }).parse(await request.json());
    await setOfficeFavorite(ctx, id, favorite);
    return NextResponse.json({ favorite });
  } catch (error) {
    return handleApiError(error, "PUT /api/office/documents/[id]/favorite");
  }
}

