import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { listActiveForEmployee } from "@/lib/calls/call-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await listActiveForEmployee(ctx));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Module disabled:")) {
      return NextResponse.json([]);
    }
    return handleApiError(error, "GET /api/connections/calls/active");
  }
}
