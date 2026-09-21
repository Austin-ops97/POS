import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { refreshSocial } from "@/lib/social/social-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json().catch(() => null)) as { connectionId?: string } | null;
    if (!body?.connectionId) throw new Error("Invalid social: choose an account to refresh");
    return NextResponse.json(await refreshSocial(ctx, body.connectionId));
  } catch (error) {
    return handleApiError(error, "POST /api/integrations/social/refresh");
  }
}
