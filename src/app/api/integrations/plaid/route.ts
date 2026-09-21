import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { canConnectBank } from "@/lib/banking/access";
import { bankConnectionStatus } from "@/lib/banking/plaid-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!canConnectBank(ctx)) throw new Error("Missing permission: manage_locations");
    return NextResponse.json(await bankConnectionStatus(ctx.business.id));
  } catch (error) {
    return handleApiError(error, "GET /api/integrations/plaid");
  }
}
