import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createRecordAssociation } from "@/lib/banking/banking-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json().catch(() => null)) as {
      receiptId?: string | null;
      documentId?: string | null;
      expenseId?: string | null;
      bankTransactionId?: string | null;
      projectId?: string | null;
      vendorId?: string | null;
      employeeId?: string | null;
      customerId?: string | null;
    } | null;
    if (!body) throw new Error("Invalid association: a JSON body is required");
    return NextResponse.json(await createRecordAssociation(ctx, body));
  } catch (error) {
    return handleApiError(error, "POST /api/banking/associations");
  }
}
