import { decryptSecret, encryptSecret } from "@/lib/integrations/quickbooks";

/** Required before a bank can leave “Not connected”. PLAID_ENV is optional and defaults to sandbox. */
export const PLAID_ENV_VARS = ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_TOKEN_ENCRYPTION_KEY"] as const;

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
};

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

  return {
    ready: missing.length === 0 && encryptionKey != null,
    missing,
    environment,
    clientId: env.PLAID_CLIENT_ID?.trim() || null,
    secret: env.PLAID_SECRET?.trim() || null,
    encryptionKey,
    host: HOSTS[environment],
  };
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
