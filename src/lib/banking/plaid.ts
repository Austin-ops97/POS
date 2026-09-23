import { decryptSecret, encryptSecret } from "@/lib/integrations/quickbooks";

/** Required before a bank can leave “Not connected”. PLAID_ENV is optional and defaults to sandbox. */
export const PLAID_ENV_VARS = ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_TOKEN_ENCRYPTION_KEY"] as const;

/** Loaded with the required keys. Redirect and webhook are optional and are not host secrets. */
export const PLAID_RUNTIME_KEYS = [
  ...PLAID_ENV_VARS,
  "PLAID_ENV",
  "PLAID_REDIRECT_URI",
  "PLAID_WEBHOOK_URL",
] as const;

/** Page Plaid returns to after an OAuth bank. Register this in the Plaid dashboard. */
export const PLAID_OAUTH_REDIRECT_PATH = "/settings/integrations/banking";

/** Plaid POSTs item and transaction webhooks here. Public, verified, no Clerk session. */
export const PLAID_WEBHOOK_PATH = "/api/webhooks/plaid";

/** One Sync click walks at most this many /transactions/sync pages. Run Sync again when the status is partial. */
export const PLAID_SYNC_PAGE_LIMIT = 5;

const HOSTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
} as const;

export type PlaidEnvironment = keyof typeof HOSTS;

export type PlaidConfig = {
  ready: boolean;
  missing: string[];
  environment: PlaidEnvironment;
  clientId: string | null;
  secret: string | null;
  encryptionKey: Buffer | null;
  host: string;
  redirectUri: string | null;
  webhookUrl: string | null;
};

function appOrigin(env: NodeJS.ProcessEnv): string | null {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim() || env.APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function normalizedPath(url: URL): string {
  const path = url.pathname.replace(/\/$/, "");
  return path || "/";
}

function acceptsRedirect(url: URL): boolean {
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

/** Absolute OAuth redirect, or null when the value is empty or not allowlist-shaped. */
export function plaidRedirectUri(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!acceptsRedirect(url)) return null;
    if (normalizedPath(url) !== PLAID_OAUTH_REDIRECT_PATH) return null;
    url.hash = "";
    url.pathname = PLAID_OAUTH_REDIRECT_PATH;
    return url.toString();
  } catch {
    return null;
  }
}

/** HTTPS webhook endpoint. Non-https origins are omitted so local manual sync still works. */
export function plaidWebhookUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (normalizedPath(url) !== PLAID_WEBHOOK_PATH) return null;
    url.hash = "";
    url.pathname = PLAID_WEBHOOK_PATH;
    return url.toString();
  } catch {
    return null;
  }
}

export function plaidConfig(env: NodeJS.ProcessEnv = process.env): PlaidConfig {
  const missing: string[] = PLAID_ENV_VARS.filter((key) => !env[key]?.trim());
  const requested = env.PLAID_ENV?.trim();
  const environment: PlaidEnvironment =
    requested === "production" || requested === "development" || requested === "sandbox" ? requested : "sandbox";
  if (requested && environment === "sandbox" && requested !== "sandbox") missing.push("PLAID_ENV");

  let encryptionKey: Buffer | null = null;
  const encoded = env.PLAID_TOKEN_ENCRYPTION_KEY?.trim();
  if (encoded) {
    const key = Buffer.from(encoded, "base64");
    encryptionKey = key.length === 32 ? key : null;
    if (!encryptionKey && !missing.includes("PLAID_TOKEN_ENCRYPTION_KEY")) missing.push("PLAID_TOKEN_ENCRYPTION_KEY");
  }

  const redirectRaw = env.PLAID_REDIRECT_URI?.trim() ?? "";
  const redirectUri = plaidRedirectUri(redirectRaw);
  if (redirectRaw && !redirectUri && !missing.includes("PLAID_REDIRECT_URI")) missing.push("PLAID_REDIRECT_URI");

  const webhookRaw = env.PLAID_WEBHOOK_URL?.trim() ?? "";
  const origin = appOrigin(env);
  const webhookUrl = webhookRaw
    ? plaidWebhookUrl(webhookRaw)
    : plaidWebhookUrl(origin ? `${origin}${PLAID_WEBHOOK_PATH}` : null);
  if (webhookRaw && !webhookUrl && !missing.includes("PLAID_WEBHOOK_URL")) missing.push("PLAID_WEBHOOK_URL");

  return {
    ready: missing.length === 0 && encryptionKey != null,
    missing,
    environment,
    clientId: env.PLAID_CLIENT_ID?.trim() || null,
    secret: env.PLAID_SECRET?.trim() || null,
    encryptionKey,
    host: HOSTS[environment],
    redirectUri,
    webhookUrl,
  };
}

export function plaidConnectGate(config: Pick<PlaidConfig, "ready" | "missing">):
  | { allow: true; message: null }
  | { allow: false; message: string } {
  if (config.ready) return { allow: true, message: null };
  const needed = config.missing.length > 0 ? config.missing.join(", ") : "PLAID_CLIENT_ID, PLAID_SECRET";
  return {
    allow: false,
    message: `Connect bank needs ${needed}. A platform admin saves those under Platform credentials at /admin/builder. The host environment keeps CREDENTIALS_ENCRYPTION_KEY so the vault can open. Plaid client id and secret stay in that vault.`,
  };
}

export function plaidLinkTokenBody(input: {
  businessId: string;
  accessToken: string | null;
  redirectUri: string | null;
  webhookUrl: string | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    client_name: "EmeraldOne",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: input.businessId },
  };
  if (input.accessToken) body.access_token = input.accessToken;
  else body.products = ["transactions"];
  if (input.redirectUri) body.redirect_uri = input.redirectUri;
  if (input.webhookUrl) body.webhook = input.webhookUrl;
  return body;
}

/** Plaid’s positive amount is money leaving the account. EmeraldOne stores outflows as negative. */
export function plaidAmountToStored(plaidAmount: number): number {
  return Math.round(-plaidAmount * 100) / 100;
}

export function plaidAccountKind(type?: string | null, subtype?: string | null): "CHECKING" | "SAVINGS" | "CREDIT" | "OTHER" {
  if (type === "credit") return "CREDIT";
  if (subtype === "savings") return "SAVINGS";
  if (subtype === "checking" || type === "depository") return "CHECKING";
  return "OTHER";
}

export function sealAccessToken(token: string, key: Buffer): string {
  return encryptSecret(token, key);
}

export function openAccessToken(payload: string, key: Buffer): string {
  return decryptSecret(payload, key);
}

export function safeBankMessage(value: string): string {
  return value
    .replace(/access_token[\s:=]+[^\s,]+/gi, "access_token=[redacted]")
    .replace(/public_token[\s:=]+[^\s,]+/gi, "public_token=[redacted]")
    .replace(/secret[\s:=]+[^\s,]+/gi, "secret=[redacted]")
    .slice(0, 300);
}
