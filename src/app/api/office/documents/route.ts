import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createOfficeDocument, listOfficeDocuments } from "@/lib/office/document-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const query = Object.fromEntries(new URL(request.url).searchParams.entries());
    return NextResponse.json(await listOfficeDocuments(ctx, query));
  } catch (error) {
    return handleApiError(error, "GET /api/office/documents");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const rateLimit = await checkRateLimitAsync(`office:create:${ctx.employee.id}`, 60, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED" }, { status: 429 });
    }
    const document = await createOfficeDocument(ctx, await request.json(), getClientIp(request));
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/office/documents");
  }
}

