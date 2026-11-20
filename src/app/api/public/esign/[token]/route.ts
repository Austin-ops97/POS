import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { publicEsignSign, publicEsignView } from "@/lib/office/esign-service";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const data = await publicEsignView(token, getClientIp(request), request.headers.get("user-agent") ?? undefined);
    if (!data) return NextResponse.json({ error: "This signing link is not valid" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error, "GET /api/public/esign/[token]");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await request.json();
    await publicEsignSign({
      token,
      signatureKind: body.signatureKind === "TYPE" ? "TYPE" : "DRAW",
      signatureData: String(body.signatureData ?? ""),
      signerName: String(body.signerName ?? ""),
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "POST /api/public/esign/[token]");
  }
}
