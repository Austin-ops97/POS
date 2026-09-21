import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { updateBankTransaction } from "@/lib/banking/banking-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      categoryId?: string | null;
      projectId?: string | null;
      vendorId?: string | null;
      customerId?: string | null;
      notes?: string | null;
      personal?: boolean;
      remember?: boolean;
    } | null;
    if (!body) throw new Error("Invalid bank transaction: a JSON body is required");
    return NextResponse.json(await updateBankTransaction(ctx, id, body));
  } catch (error) {
    return handleApiError(error, "PATCH /api/banking/transactions/[id]");
  }
}
