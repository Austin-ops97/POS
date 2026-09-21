import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createSocialPost, socialOverview } from "@/lib/social/social-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await socialOverview(ctx));
  } catch (error) {
    return handleApiError(error, "GET /api/social/posts");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const form = await request.formData();
    const file = form.get("image");
    let image: { name: string; mime: string; data: Buffer } | null = null;
    if (file instanceof File && file.size > 0) {
      image = { name: file.name || "image", mime: file.type || "image/jpeg", data: Buffer.from(await file.arrayBuffer()) };
    }
    const connectionIds = form.getAll("connectionId").map((value) => String(value)).filter(Boolean);
    const result = await createSocialPost(ctx, {
      body: String(form.get("body") || ""),
      linkUrl: String(form.get("linkUrl") || ""),
      scheduledFor: String(form.get("scheduledFor") || "") || null,
      connectionIds,
      image,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "POST /api/social/posts");
  }
}
