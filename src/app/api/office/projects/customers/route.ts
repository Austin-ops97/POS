import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { searchProjectCustomers } from "@/lib/office/project-form-options";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const limit = await checkRateLimitAsync(`office:project-customers:${ctx.employee.id}`, 60, 60_000);
    if (!limit.ok) return jsonError("Too many customer searches. Wait a minute and try again.", 429);

    const query = new URL(request.url).searchParams.get("q") ?? "";
    const customers = await searchProjectCustomers(ctx, query);
    return NextResponse.json({ customers });
  } catch (error) {
    return handleApiError(error, "GET /api/office/projects/customers");
  }
}
