import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { uploadOfficeFile } from "@/lib/office/file-service";

type Params = { params: Promise<{ id: string }> };

function optionalInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const rateLimit = await checkRateLimitAsync(`office:upload:${ctx.employee.id}`, 30, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json({ error: "Too many uploads", code: "RATE_LIMITED" }, { status: 429 });
    }
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "A file is required", code: "FILE_REQUIRED" }, { status: 400 });
    }
    const created = await uploadOfficeFile(
      ctx,
      id,
      file as File,
      {
        sortOrder: optionalInteger(form.get("sortOrder")),
        width: optionalInteger(form.get("width")),
        height: optionalInteger(form.get("height")),
      },
      getClientIp(request)
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/documents/[id]/files");
  }
}
