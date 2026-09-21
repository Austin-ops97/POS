import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { linkedInConnectUrl } from "@/lib/social/social-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return NextResponse.redirect(linkedInConnectUrl(ctx));
  } catch (error) {
    return handleApiError(error, "GET /api/integrations/linkedin/connect");
  }
}
