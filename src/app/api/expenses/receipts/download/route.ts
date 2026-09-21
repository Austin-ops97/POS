import { NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { PERMISSIONS } from "@/lib/permissions";
import { receiptDownloadSchema } from "@/lib/validations/expenses";
import { buildReceiptArchive } from "@/lib/expenses/receipt-library";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES) &&
      !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.VIEW_OWN_EXPENSES}`);
    }
    const limit = await checkRateLimitAsync(`expense:receipt-zip:${ctx.employee.id}`, 8, 60_000);
    if (!limit.ok) {
      return NextResponse.json({ error: "Too many downloads", code: "RATE_LIMITED" }, { status: 429 });
    }
    const body = receiptDownloadSchema.parse(await request.json());
    if (!body.allFiltered && !body.receiptIds?.length) {
      throw new Error("Invalid receipt download: select receipts or download the filtered set");
    }
    const { archive, count } = await buildReceiptArchive(ctx, body);
    return new NextResponse(new Uint8Array(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="emeraldone-receipts-${count}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/receipts/download");
  }
}
