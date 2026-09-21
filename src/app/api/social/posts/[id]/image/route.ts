import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { readSocialImage } from "@/lib/social/social-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const image = await readSocialImage(ctx, id);
    return new NextResponse(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mime,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/social/posts/[id]/image");
  }
}
