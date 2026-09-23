import { randomBytes } from "crypto";
import { PLAID_OAUTH_REDIRECT_PATH, PLAID_WEBHOOK_PATH, plaidConfig, plaidRedirectUri } from "@/lib/banking/plaid";
import { QUICKBOOKS_CALLBACK_PATH, decryptSecret, encryptSecret, intuitConfig } from "@/lib/integrations/quickbooks";
import { LINKEDIN_CALLBACK_PATH, META_CALLBACK_PATH, linkedInConfig, metaConfig } from "@/lib/social/providers";

export const CREDENTIALS_ENCRYPTION_ENV = "CREDENTIALS_ENCRYPTION_KEY";

export const PLATFORM_PROVIDER_IDS = ["meta", "linkedin", "plaid", "intuit"] as const;
export type PlatformProviderId = (typeof PLATFORM_PROVIDER_IDS)[number];

export type MasterKeyState = "ok" | "missing" | "invalid";
export type CredentialSource = "vault" | "environment" | "missing";
export type CredentialInput = "secret" | "text" | "choice";

export type PublicCredentialField = {
  key: string;
  label: string;
  secret: boolean;
  managed: boolean;
  configured: boolean;
  source: CredentialSource;
  hint: string | null;
  value: string | null;
  updatedAt: string | null;
  input: CredentialInput;
  choices: string[] | null;
};

export type PublicProviderCredentials = {
  id: PlatformProviderId;
  label: string;
  summary: string;
  configured: boolean;
  missing: string[];
  updatedAt: string | null;
  suggestedRedirect: string | null;
  whitelistRedirect: string | null;
  suggestedWebhook: string | null;
  environment: string | null;
  fields: PublicCredentialField[];
};

type FieldSpec = {
  key: string;
  label: string;
  kind: "secret" | "redirect" | "choice";
  choices?: readonly string[];
  callbackPath?: string;
};

type ProviderSpec = {
  id: PlatformProviderId;
  label: string;
  summary: string;
  tokenKey: string;
  tokenLabel: string;
  fields: FieldSpec[];
  assess: (env: NodeJS.ProcessEnv) => { ready: boolean; missing: readonly string[] };
  environment?: (env: NodeJS.ProcessEnv) => string;
  webhookPath?: string;
};

const PROVIDERS: Record<PlatformProviderId, ProviderSpec> = {
  meta: {
    id: "meta",
    label: "Meta",
    summary: "Facebook and Instagram. Instagram uses the Facebook Page connection.",
    tokenKey: "SOCIAL_TOKEN_ENCRYPTION_KEY",
    tokenLabel: "Social token encryption key",
    fields: [
      { key: "META_APP_ID", label: "App ID", kind: "secret" },
      { key: "META_APP_SECRET", label: "App secret", kind: "secret" },
      { key: "META_REDIRECT_URI", label: "Redirect URI", kind: "redirect", callbackPath: META_CALLBACK_PATH },
    ],
    assess: (env) => metaConfig(env),
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    summary: "Member and organization posting.",
    tokenKey: "SOCIAL_TOKEN_ENCRYPTION_KEY",
    tokenLabel: "Social token encryption key",
    fields: [
      { key: "LINKEDIN_CLIENT_ID", label: "Client ID", kind: "secret" },
      { key: "LINKEDIN_CLIENT_SECRET", label: "Client secret", kind: "secret" },
      { key: "LINKEDIN_REDIRECT_URI", label: "Redirect URI", kind: "redirect", callbackPath: LINKEDIN_CALLBACK_PATH },
    ],
    assess: (env) => linkedInConfig(env),
  },
  plaid: {
    id: "plaid",
    label: "Plaid",
    summary: "Bank link. EmeraldOne does not collect bank passwords.",
    tokenKey: "PLAID_TOKEN_ENCRYPTION_KEY",
    tokenLabel: "Plaid token encryption key",
    fields: [
      { key: "PLAID_CLIENT_ID", label: "Client ID", kind: "secret" },
      { key: "PLAID_SECRET", label: "Secret", kind: "secret" },
      { key: "PLAID_REDIRECT_URI", label: "OAuth redirect URI", kind: "redirect", callbackPath: PLAID_OAUTH_REDIRECT_PATH },
      { key: "PLAID_ENV", label: "Environment", kind: "choice", choices: ["sandbox", "development", "production"] },
    ],
    assess: (env) => plaidConfig(env),
    environment: (env) => plaidConfig(env).environment,
    webhookPath: PLAID_WEBHOOK_PATH,
  },
  intuit: {
    id: "intuit",
    label: "Intuit QuickBooks",
    summary: "QuickBooks Online. The realm id comes back when a business connects.",
    tokenKey: "INTUIT_TOKEN_ENCRYPTION_KEY",
    tokenLabel: "QuickBooks token encryption key",
    fields: [
      { key: "INTUIT_CLIENT_ID", label: "Client ID", kind: "secret" },
      { key: "INTUIT_CLIENT_SECRET", label: "Client secret", kind: "secret" },
      { key: "INTUIT_REDIRECT_URI", label: "Redirect URI", kind: "redirect", callbackPath: QUICKBOOKS_CALLBACK_PATH },
      { key: "INTUIT_ENVIRONMENT", label: "Environment", kind: "choice", choices: ["sandbox", "production"] },
    ],
    assess: (env) => intuitConfig(env),
    environment: (env) => intuitConfig(env).environment,
  },
};

export function isPlatformProviderId(value: string): value is PlatformProviderId {
  return (PLATFORM_PROVIDER_IDS as readonly string[]).includes(value);
}

export function masterKeyState(env: NodeJS.ProcessEnv = process.env): MasterKeyState {
  const encoded = env[CREDENTIALS_ENCRYPTION_ENV]?.trim();
  if (!encoded) return "missing";
  const key = Buffer.from(encoded, "base64");
  return key.length === 32 ? "ok" : "invalid";
}

export function masterKeyBytes(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  if (masterKeyState(env) !== "ok") return null;
  return Buffer.from(env[CREDENTIALS_ENCRYPTION_ENV]!.trim(), "base64");
}

export function sealVaultValue(plain: string, key: Buffer): string {
  return encryptSecret(plain, key);
}

export function openVaultValue(payload: string, key: Buffer): string {
  return decryptSecret(payload, key);
}

export function credentialHint(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 8) return null;
  return trimmed.slice(-4);
}

export function platformAppOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim() || env.APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function mergeCredentialEnv(
  env: NodeJS.ProcessEnv,
  vault: Record<string, string | undefined>
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...env };
  for (const [key, value] of Object.entries(vault)) {
    const trimmed = value?.trim();
    if (trimmed) merged[key] = trimmed;
  }
  return merged;
}

/** Vault value wins. An empty vault entry falls through to the host environment. */
export function readPlatformCredential(
  name: string,
  vault: Record<string, string | undefined>,
  env: NodeJS.ProcessEnv
): string | null {
  const fromVault = vault[name]?.trim();
  if (fromVault) return fromVault;
  const fromEnv = env[name]?.trim();
  return fromEnv || null;
}

export function providerClearKeys(provider: PlatformProviderId): string[] {
  return PROVIDERS[provider].fields.map((field) => field.key);
}

function tokenKeyValid(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return Buffer.from(trimmed, "base64").length === 32;
}

export type ProviderWritePlan =
  | { ok: true; upserts: Record<string, string> }
  | { ok: false; error: string };

export function planProviderWrite(input: {
  provider: PlatformProviderId;
  incoming: Record<string, string | undefined>;
  vault: Record<string, string | undefined>;
  env: NodeJS.ProcessEnv;
  generateTokenKey?: () => string;
}): ProviderWritePlan {
  const spec = PROVIDERS[input.provider];
  const allowed = new Set(spec.fields.map((field) => field.key));
  for (const [key, value] of Object.entries(input.incoming)) {
    if (value?.trim() && !allowed.has(key)) {
      return { ok: false, error: `Invalid platform credentials: ${key} cannot be stored for ${spec.label}` };
    }
  }

  const origin = platformAppOrigin(input.env);
  const upserts: Record<string, string> = {};
  const resolved: Record<string, string> = {};

  for (const field of spec.fields) {
    const raw = input.incoming[field.key]?.trim() ?? "";
    const existing = input.vault[field.key]?.trim() ?? "";
    const fromEnv = input.env[field.key]?.trim() ?? "";
    let next = raw || existing || fromEnv;
    if (!next && field.kind === "redirect" && field.callbackPath && origin) {
      const suggested = `${origin}${field.callbackPath}`;
      if (field.callbackPath !== PLAID_OAUTH_REDIRECT_PATH || plaidRedirectUri(suggested)) {
        next = suggested;
      }
    }
    if (!next && field.kind === "choice" && field.choices?.length) {
      next = field.choices[0];
    }
    if (field.kind === "choice" && next && field.choices && !field.choices.includes(next)) {
      return {
        ok: false,
        error: `Invalid platform credentials: ${field.key} must be ${field.choices.join(", ")}`,
      };
    }
    if (field.callbackPath && next && !next.endsWith(field.callbackPath)) {
      return {
        ok: false,
        error: `Invalid platform credentials: ${field.key} must end with ${field.callbackPath}`,
      };
    }
    if (field.callbackPath === PLAID_OAUTH_REDIRECT_PATH && next && !plaidRedirectUri(next)) {
      return {
        ok: false,
        error: `Invalid platform credentials: ${field.key} must be https, or http://localhost, and end with ${field.callbackPath}`,
      };
    }
    if (next) resolved[field.key] = next;
    if (raw) {
      if (raw !== existing) upserts[field.key] = raw;
    } else if (!existing && next && next !== fromEnv && (field.kind === "redirect" || field.kind === "choice")) {
      upserts[field.key] = next;
    }
  }

  const vaultToken = input.vault[spec.tokenKey];
  const envToken = input.env[spec.tokenKey];
  if (!tokenKeyValid(vaultToken) && !tokenKeyValid(envToken)) {
    const generated = (input.generateTokenKey ?? (() => randomBytes(32).toString("base64")))();
    if (!tokenKeyValid(generated)) {
      return { ok: false, error: "Invalid platform credentials: token encryption key could not be generated" };
    }
    upserts[spec.tokenKey] = generated;
    resolved[spec.tokenKey] = generated;
  } else if (tokenKeyValid(vaultToken)) {
    resolved[spec.tokenKey] = vaultToken!.trim();
  } else if (tokenKeyValid(envToken)) {
    resolved[spec.tokenKey] = envToken!.trim();
  }

  const merged = mergeCredentialEnv(input.env, { ...input.vault, ...resolved, ...upserts });
  const status = spec.assess(merged);
  if (!status.ready) {
    return {
      ok: false,
      error: `Invalid platform credentials: still missing ${status.missing.join(", ")}`,
    };
  }
  return { ok: true, upserts };
}

function projectField(
  field: { key: string; label: string; kind: FieldSpec["kind"]; choices?: readonly string[]; managed?: boolean },
  vault: Record<string, string | undefined>,
  env: NodeJS.ProcessEnv,
  updatedAt: Record<string, string | undefined>
): PublicCredentialField {
  const vaultValue = vault[field.key]?.trim() ?? "";
  const envValue = env[field.key]?.trim() ?? "";
  const value = vaultValue || envValue;
  const source: CredentialSource = vaultValue ? "vault" : envValue ? "environment" : "missing";
  const secret = field.kind === "secret" || Boolean(field.managed);
  const configured = field.managed ? tokenKeyValid(value) : Boolean(value);
  return {
    key: field.key,
    label: field.label,
    secret,
    managed: Boolean(field.managed),
    configured,
    source: configured || value ? source : "missing",
    hint: secret && configured && !field.managed ? credentialHint(value) : null,
    value: secret ? null : value || null,
    updatedAt: source === "vault" ? updatedAt[field.key] ?? null : null,
    input: field.managed ? "secret" : field.kind === "choice" ? "choice" : field.kind === "redirect" ? "text" : "secret",
    choices: field.choices ? [...field.choices] : null,
  };
}

export function projectPlatformCredentials(input: {
  vault: Record<string, string | undefined>;
  env: NodeJS.ProcessEnv;
  updatedAt?: Record<string, string | undefined>;
}): {
  masterKey: MasterKeyState;
  appOrigin: string | null;
  providers: PublicProviderCredentials[];
} {
  const updatedAt = input.updatedAt ?? {};
  const origin = platformAppOrigin(input.env);
  const merged = mergeCredentialEnv(input.env, input.vault);
  const providers = PLATFORM_PROVIDER_IDS.map((id) => {
    const spec = PROVIDERS[id];
    const status = spec.assess(merged);
    const fields = spec.fields.map((field) => projectField(field, input.vault, input.env, updatedAt));
    fields.push(
      projectField(
        { key: spec.tokenKey, label: spec.tokenLabel, kind: "secret", managed: true },
        input.vault,
        input.env,
        updatedAt
      )
    );
    const redirectField = spec.fields.find((field) => field.kind === "redirect");
    const suggestedRedirect = redirectField?.callbackPath && origin ? `${origin}${redirectField.callbackPath}` : null;
    const storedRedirect = redirectField ? readPlatformCredential(redirectField.key, input.vault, input.env) : null;
    const webhookOrigin = origin?.startsWith("https://") ? origin : null;
    const suggestedWebhook = spec.webhookPath && webhookOrigin ? `${webhookOrigin}${spec.webhookPath}` : null;
    const stamps = fields.map((field) => field.updatedAt).filter((stamp): stamp is string => Boolean(stamp));
    return {
      id,
      label: spec.label,
      summary: spec.summary,
      configured: status.ready,
      missing: [...status.missing],
      updatedAt: stamps.sort().at(-1) ?? null,
      suggestedRedirect,
      whitelistRedirect: storedRedirect || suggestedRedirect,
      suggestedWebhook,
      environment: spec.environment ? spec.environment(merged) : null,
      fields,
    };
  });
  return { masterKey: masterKeyState(input.env), appOrigin: origin, providers };
}
