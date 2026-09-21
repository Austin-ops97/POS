import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { listBankCenter, type BankListQuery } from "@/lib/banking/banking-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(request.url);
    const personal = url.searchParams.get("personal");
    const query: BankListQuery = {
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      accountId: url.searchParams.get("accountId") || undefined,
      categoryId: url.searchParams.get("categoryId") || undefined,
      q: url.searchParams.get("q") || undefined,
      personal: personal === "personal" || personal === "business" ? personal : "all",
    };
    return NextResponse.json(await listBankCenter(ctx, query));
  } catch (error) {
    return handleApiError(error, "GET /api/banking/transactions");
  }
}
