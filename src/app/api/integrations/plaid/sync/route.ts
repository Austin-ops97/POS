import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { syncBankConnection } from "@/lib/banking/plaid-service";

export async function POST() {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await syncBankConnection(ctx));
  } catch (error) {
    return handleApiError(error, "POST /api/integrations/plaid/sync");
  }
}
