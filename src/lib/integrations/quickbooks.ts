import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const QUICKBOOKS_CALLBACK_PATH = "/api/integrations/quickbooks/callback";

export const INTUIT_ENV_VARS = [
  "INTUIT_CLIENT_ID",
  "INTUIT_CLIENT_SECRET",
  "INTUIT_REDIRECT_URI",
  "INTUIT_TOKEN_ENCRYPTION_KEY",
] as const;

export const QUICKBOOKS_PULL_ENTITIES = ["Customer", "Vendor", "Item", "Purchase"] as const;
export const QUICKBOOKS_DEFERRED_ENTITIES = ["Account", "Invoice", "Payment"] as const;

export type IntuitConfig = {
  ready: boolean;
  missing: string[];
  environment: "sandbox" | "production";
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  encryptionKey: Buffer | null;
};

export function intuitConfig(env: NodeJS.ProcessEnv = process.env): IntuitConfig {
  const missing = INTUIT_ENV_VARS.filter((key) => !env[key]?.trim());
  const redirectUri = env.INTUIT_REDIRECT_URI?.trim() || null;
  if (redirectUri && !redirectUri.endsWith(QUICKBOOKS_CALLBACK_PATH) && !missing.includes("INTUIT_REDIRECT_URI")) {
    missing.push("INTUIT_REDIRECT_URI");
  }
  const environment = env.INTUIT_ENVIRONMENT === "production" ? "production" : "sandbox";
  let encryptionKey: Buffer | null = null;
  const encoded = env.INTUIT_TOKEN_ENCRYPTION_KEY?.trim();
  if (encoded) {
    const key = Buffer.from(encoded, "base64");
    encryptionKey = key.length === 32 ? key : null;
    if (!encryptionKey && !missing.includes("INTUIT_TOKEN_ENCRYPTION_KEY")) missing.push("INTUIT_TOKEN_ENCRYPTION_KEY");
  }
  return {
    ready: missing.length === 0 && encryptionKey != null,
    missing,
    environment,
    clientId: env.INTUIT_CLIENT_ID?.trim() || null,
    clientSecret: env.INTUIT_CLIENT_SECRET?.trim() || null,
    redirectUri,
    encryptionKey,
  };
}

export function intuitApiBase(environment: "sandbox" | "production"): string {
  return environment === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
}

export function intuitAuthorizeUrl(config: IntuitConfig, state: string): string {
  if (!config.ready || !config.clientId || !config.redirectUri) {
    throw new Error("Invalid QuickBooks: Intuit credentials are not configured");
  }
  const url = new URL("https://appcenter.intuit.com/connect/oauth2");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  url.searchParams.set("state", state);
  return url.toString();
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

type OAuthState = { businessId: string; employeeId: string; exp: number };

export function signOAuthState(payload: { businessId: string; employeeId: string }, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + 10 * 60 * 1000 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(token: string, secret: string, now = Date.now()): OAuthState | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  if (!parsed.businessId || !parsed.employeeId || parsed.exp < now) return null;
  return parsed;
}

export type QuickBooksRecord = Record<string, unknown>;

export function quickBooksRows(entity: string, records: QuickBooksRecord[]): { headers: string[]; rows: string[][] } {
  if (entity === "Customer") {
    return {
      headers: ["Display Name", "Email", "Phone", "Id"],
      rows: records.map((record) => [
        stringField(record.DisplayName) || stringField(record.GivenName),
        nested(record.PrimaryEmailAddr, "Address"),
        nested(record.PrimaryPhone, "FreeFormNumber"),
        stringField(record.Id),
      ]),
    };
  }
  if (entity === "Vendor") {
    return {
      headers: ["Vendor", "Phone", "Id"],
      rows: records.map((record) => [stringField(record.DisplayName), nested(record.PrimaryPhone, "FreeFormNumber"), stringField(record.Id)]),
    };
  }
  if (entity === "Item") {
    return {
      headers: ["Name", "Sku", "Price", "Id"],
      rows: records.map((record) => [stringField(record.Name), stringField(record.Sku), stringField(record.UnitPrice), stringField(record.Id)]),
    };
  }
  if (entity === "Purchase") {
    return {
      headers: ["Payee", "Total", "Date", "Doc Number", "Id"],
      rows: records.map((record) => [
        nested(record.EntityRef, "name"),
        stringField(record.TotalAmt),
        stringField(record.TxnDate),
        stringField(record.DocNumber),
        stringField(record.Id),
      ]),
    };
  }
  return { headers: [], rows: [] };
}

function stringField(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function nested(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  return stringField((value as Record<string, unknown>)[key]);
}
