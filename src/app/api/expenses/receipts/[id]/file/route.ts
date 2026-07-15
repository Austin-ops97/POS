import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { canViewAllExpenses } from "@/lib/expenses/expense-service";
import { readReceiptBlob } from "@/lib/storage/receipt-storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;

    const receipt = await db.expenseReceipt.findFirst({
      where: {
        id,
        deletedAt: null,
        expense: {
          businessId: ctx.business.id,
          deletedAt: null,
        },
      },
      include: {
        expense: { select: { employeeId: true } },
      },
    });

    if (!receipt) {
      return jsonError("Receipt not found", 404);
    }

    if (
      !canViewAllExpenses(ctx) &&
      receipt.expense.employeeId !== ctx.employee.id
    ) {
      return jsonError("Forbidden", 403);
    }

    const blob = await readReceiptBlob(receipt.storageUrl);
    if (!blob) {
      return jsonError("Receipt file missing", 404);
    }

    return new NextResponse(new Uint8Array(blob.buffer), {
      status: 200,
      headers: {
        "Content-Type": blob.mimeType || receipt.mimeType,
        "Content-Disposition": `inline; filename="${receipt.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/receipts/[id]/file");
  }
}
