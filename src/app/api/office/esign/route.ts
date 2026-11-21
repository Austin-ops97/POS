import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createAndSendEsign, listEsignRequests } from "@/lib/office/esign-service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return NextResponse.json(await listEsignRequests(ctx));
  } catch (error) {
    return handleApiError(error, "GET /api/office/esign");
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    return NextResponse.json(
      await createAndSendEsign(ctx, {
        title: String(body.title ?? ""),
        kind: body.kind ?? "CONTRACT",
        body: body.body,
        documentId: body.documentId || null,
        customerId: body.customerId || null,
        signerName: String(body.signerName ?? ""),
        signerEmail: String(body.signerEmail ?? ""),
        requestOrigin: new URL(request.url).origin,
      }),
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "POST /api/office/esign");
  }
}
