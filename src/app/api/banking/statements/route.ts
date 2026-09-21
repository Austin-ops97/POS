import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { importBankStatement } from "@/lib/banking/banking-service";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const form = await request.formData();
    const file = form.get("file");
    const accountName = String(form.get("accountName") || "");
    if (!(file instanceof File)) throw new Error("Invalid statement: choose a CSV or Excel file");
    const buffer = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(
      await importBankStatement(ctx, {
        fileName: file.name || "statement.csv",
        mimeType: file.type || "text/csv",
        buffer,
        accountName,
      }),
    );
  } catch (error) {
    return handleApiError(error, "POST /api/banking/statements");
  }
}
