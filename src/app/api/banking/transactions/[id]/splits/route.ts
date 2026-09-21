import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { replaceBankSplits } from "@/lib/banking/banking-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      splits?: { categoryId?: string | null; projectId?: string | null; vendorId?: string | null; amount?: number; notes?: string | null }[];
    } | null;
    if (!body?.splits) throw new Error("Invalid split: include a splits list");
    const splits = body.splits.map((split) => {
      if (split.amount == null || Number.isNaN(Number(split.amount))) throw new Error("Invalid split: each part needs an amount");
      return {
        categoryId: split.categoryId,
        projectId: split.projectId,
        vendorId: split.vendorId,
        amount: Number(split.amount),
        notes: split.notes,
      };
    });
    return NextResponse.json(await replaceBankSplits(ctx, id, splits));
  } catch (error) {
    return handleApiError(error, "POST /api/banking/transactions/[id]/splits");
  }
}
