import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createBankLinkToken } from "@/lib/banking/plaid-service";

export async function POST() {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await createBankLinkToken(ctx));
  } catch (error) {
    return handleApiError(error, "POST /api/integrations/plaid/link-token");
  }
}
