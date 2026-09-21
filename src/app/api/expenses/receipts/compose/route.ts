import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, hasPermission } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { PERMISSIONS } from "@/lib/permissions";
import { buildScanPdf } from "@/lib/expenses/scan-pdf";

const composeSchema = z.object({
  pages: z
    .array(
      z.object({
        dataUrl: z.string().min(32).max(8_000_000),
        width: z.number().int().positive().max(4000).optional(),
        height: z.number().int().positive().max(4000).optional(),
      })
    )
    .min(1)
    .max(12),
});

function decodeJpeg(dataUrl: string) {
  const match = /^data:image\/jpeg;base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!match) throw new Error("Invalid scan: each page must be a JPEG image");
  const data = Buffer.from(match[1], "base64");
  if (!data.length || data.length > 4_000_000) throw new Error("Invalid scan: a page is empty or too large");
  return data;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (
      !hasPermission(ctx, PERMISSIONS.CREATE_EXPENSE) &&
      !hasPermission(ctx, PERMISSIONS.SCAN_DOCUMENTS)
    ) {
      throw new Error(`Missing permission: ${PERMISSIONS.CREATE_EXPENSE}`);
    }
    const limit = await checkRateLimitAsync(`scan:pdf:${ctx.employee.id}`, 20, 60_000);
    if (!limit.ok) {
      return NextResponse.json({ error: "Too many scans", code: "RATE_LIMITED" }, { status: 429 });
    }
    const body = composeSchema.parse(await request.json());
    const pdf = await buildScanPdf(
      body.pages.map((page) => ({
        data: decodeJpeg(page.dataUrl),
        width: page.width,
        height: page.height,
      }))
    );
    if (pdf.length > 12_000_000) throw new Error("Invalid scan: the PDF is larger than 12 MB");
    return NextResponse.json({
      fileName: `receipt-${Date.now()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      storageUrl: `data:application/pdf;base64,${pdf.toString("base64")}`,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/expenses/receipts/compose");
  }
}
