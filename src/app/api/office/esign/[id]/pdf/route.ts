import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { getSignedPdf } from "@/lib/office/esign-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const row = await getSignedPdf(ctx, id);
    const pdf = Buffer.from(row.signedPdf as Uint8Array);
    const name = `${row.title.replace(/[^A-Za-z0-9]+/g, "-") || "signed"}-signed.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "GET /api/office/esign/[id]/pdf");
  }
}
