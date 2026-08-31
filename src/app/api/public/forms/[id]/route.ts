import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { getPublicForm, submitPublicFormResponse } from "@/lib/office/public-form-service";
import { checkRateLimitAsync } from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const form = await getPublicForm(id);
    if (!form) {
      return NextResponse.json({ error: "Form not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(form);
  } catch (error) {
    return handleApiError(error, "GET /api/public/forms/[id]");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ip = getClientIp(request) ?? "unknown";
    const rateLimit = await checkRateLimitAsync(`public-form:${id}:${ip}`, 10, 60_000);
    if (!rateLimit.ok) {
      return NextResponse.json({ error: "Too many submissions. Try again shortly.", code: "RATE_LIMITED" }, { status: 429 });
    }

    const body = await request.json();
    const answers = body?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return NextResponse.json({ error: "Invalid submission", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const created = await submitPublicFormResponse(id, answers as Record<string, string | boolean>, ip);
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === "Form not found" || error.message === "Form is not published")) {
      return NextResponse.json({ error: error.message, code: "NOT_FOUND" }, { status: 404 });
    }
    if (error instanceof Error && error.message.endsWith("is required")) {
      return NextResponse.json({ error: error.message, code: "VALIDATION_ERROR" }, { status: 400 });
    }
    return handleApiError(error, "POST /api/public/forms/[id]");
  }
}
