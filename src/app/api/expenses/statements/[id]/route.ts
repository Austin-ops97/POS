import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError, jsonError } from "@/lib/api-utils";
import { deleteBankStatement, canViewBankStatements } from "@/lib/expenses/bank-statement-service";
import { readReceiptBlob } from "@/lib/storage/receipt-storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!canViewBankStatements(ctx)) {
      return jsonError("Forbidden", 403);
    }
    const { id } = await params;
    const statement = await db.bankStatement.findFirst({
      where: { id, businessId: ctx.business.id, deletedAt: null },
    });
    if (!statement) return jsonError("Bank statement not found", 404);
    const blob = await readReceiptBlob(statement.storageUrl, statement.data, statement.mimeType);
    if (!blob) return jsonError("Statement file missing", 404);
    return new NextResponse(new Uint8Array(blob.buffer), {
      status: 200,
      headers: {
        "Content-Type": blob.mimeType || statement.mimeType,
        "Content-Disposition": `inline; filename="${statement.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/expenses/statements/[id]");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await deleteBankStatement(ctx, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "DELETE /api/expenses/statements/[id]");
  }
}
