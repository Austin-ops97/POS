import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError, getClientIp } from "@/lib/api-utils";
import { softDeleteReceipt } from "@/lib/expenses/receipt-service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const receipt = await softDeleteReceipt(ctx, id, getClientIp(request));
    return NextResponse.json(receipt);
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/receipts/[id]");
  }
}
