import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { listAttachments, uploadAttachment } from "@/lib/office/completion-service";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { projectId } = await params;
    return NextResponse.json(await listAttachments(ctx, projectId));
  } catch (error) {
    return handleApiError(error, "GET /api/office/projects/[projectId]/attachments");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:attachment:upload:${ctx.employee.id}`, 40, 60_000);
    if (!limit.ok) return jsonError("Too many uploads. Wait a minute and try again.", 429);
    const { projectId } = await params;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError("Expected multipart form data", 400);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("A photo file is required", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const caption = typeof form.get("caption") === "string" ? String(form.get("caption")) : null;

    const attachment = await uploadAttachment(ctx, projectId, {
      fileName: file.name || "photo.jpg",
      mimeType: file.type || "image/jpeg",
      data: buffer,
      caption,
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/projects/[projectId]/attachments");
  }
}
