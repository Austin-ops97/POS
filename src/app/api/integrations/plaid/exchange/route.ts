import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { exchangeBankToken } from "@/lib/banking/plaid-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json().catch(() => null)) as {
      publicToken?: string;
      institutionId?: string | null;
      institutionName?: string | null;
    } | null;
    if (!body?.publicToken) throw new Error("Invalid Plaid: public token is required");
    return NextResponse.json(
      await exchangeBankToken(ctx, {
        publicToken: body.publicToken,
        institutionId: body.institutionId,
        institutionName: body.institutionName,
      }),
    );
  } catch (error) {
    return handleApiError(error, "POST /api/integrations/plaid/exchange");
  }
}
