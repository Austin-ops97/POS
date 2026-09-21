import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { searchBusiness } from "@/lib/search/global-search";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const hits = await searchBusiness(ctx, q);
    return NextResponse.json({ hits });
  } catch (error) {
    return handleApiError(error, "GET /api/search");
  }
}
