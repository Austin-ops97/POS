import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    void request;
    void ctx;
    return NextResponse.json(
      { error: "Module licensing is managed by the platform administrator" },
      { status: 403 }
    );
  } catch (error) {
    return handleApiError(error, "PATCH /api/business/modules");
  }
}
