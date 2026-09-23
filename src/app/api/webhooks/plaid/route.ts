import { NextResponse } from "next/server";
import { loadPlaidConfig } from "@/lib/credentials/load";
import { applyVerifiedPlaidWebhook, fetchPlaidWebhookVerificationKey } from "@/lib/banking/plaid-service";
import { plaidWebhookKeyId, verifyPlaidWebhookJwt, type PlaidWebhookPayload } from "@/lib/banking/plaid-webhook";

export const runtime = "nodejs";

const keyCache = new Map<string, Awaited<ReturnType<typeof fetchPlaidWebhookVerificationKey>>>();

export async function POST(request: Request) {
  const rawBody = await request.text();
  const token = request.headers.get("plaid-verification");
  if (!token) {
    return NextResponse.json({ error: "Invalid Plaid verification" }, { status: 401 });
  }
  const config = await loadPlaidConfig();
  if (!config.ready) {
    return NextResponse.json({ error: "Plaid is not configured" }, { status: 503 });
  }
  const kid = plaidWebhookKeyId(token);
  if (!kid) {
    return NextResponse.json({ error: "Invalid Plaid verification" }, { status: 401 });
  }

  try {
    const cached = keyCache.get(kid);
    const jwk = cached && cached.expired_at == null ? cached : await fetchPlaidWebhookVerificationKey(kid);
    if (jwk.expired_at == null) keyCache.set(kid, jwk);
    const verified = verifyPlaidWebhookJwt({ jwt: token, rawBody, jwk });
    if (!verified.ok) {
      if (verified.reason === "expired_key") keyCache.delete(kid);
      return NextResponse.json({ error: "Invalid Plaid verification" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid Plaid verification" }, { status: 401 });
  }

  let payload: PlaidWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PlaidWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid Plaid webhook" }, { status: 400 });
  }

  try {
    const result = await applyVerifiedPlaidWebhook(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/webhooks/plaid", error instanceof Error ? error.message : "sync failed");
    return NextResponse.json({ error: "Plaid webhook was not applied" }, { status: 500 });
  }
}
