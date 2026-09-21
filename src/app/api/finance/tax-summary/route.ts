import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { taxSummaryDownload, taxSummaryReport } from "@/lib/banking/banking-service";

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(request.url);
    const query = {
      preset: url.searchParams.get("preset") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
    };
    const format = url.searchParams.get("format");
    if (format === "csv" || format === "pdf" || format === "xlsx" || format === "receipts") {
      const file = await taxSummaryDownload(ctx, query, format);
      return new NextResponse(new Uint8Array(file.body), {
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${file.filename}"`,
        },
      });
    }
    return NextResponse.json(await taxSummaryReport(ctx, query));
  } catch (error) {
    return handleApiError(error, "GET /api/finance/tax-summary");
  }
}
