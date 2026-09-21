import { decryptSecret, encryptSecret, signOAuthState, verifyOAuthState } from "@/lib/integrations/quickbooks";

export const META_GRAPH_VERSION = "v21.0";
export const META_CALLBACK_PATH = "/api/integrations/meta/callback";
export const LINKEDIN_CALLBACK_PATH = "/api/integrations/linkedin/callback";
export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];
export const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social", "w_organization_social"];

export const META_ENV_VARS = ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI", "SOCIAL_TOKEN_ENCRYPTION_KEY"] as const;
export const LINKEDIN_ENV_VARS = ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_REDIRECT_URI", "SOCIAL_TOKEN_ENCRYPTION_KEY"] as const;

export type SocialProviderConfig = {
  ready: boolean;
  missing: string[];
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  encryptionKey: Buffer | null;
};

function encryptionKey(env: NodeJS.ProcessEnv, missing: string[]): Buffer | null {
  const encoded = env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  if (key.length === 32) return key;
  if (!missing.includes("SOCIAL_TOKEN_ENCRYPTION_KEY")) missing.push("SOCIAL_TOKEN_ENCRYPTION_KEY");
  return null;
}

export function metaConfig(env: NodeJS.ProcessEnv = process.env): SocialProviderConfig {
  const missing: string[] = META_ENV_VARS.filter((key) => !env[key]?.trim());
  const redirectUri = env.META_REDIRECT_URI?.trim() || null;
  if (redirectUri && !redirectUri.endsWith(META_CALLBACK_PATH) && !missing.includes("META_REDIRECT_URI")) missing.push("META_REDIRECT_URI");
  const key = encryptionKey(env, missing);
  return {
    ready: missing.length === 0 && key != null,
    missing,
    clientId: env.META_APP_ID?.trim() || null,
    clientSecret: env.META_APP_SECRET?.trim() || null,
    redirectUri,
    encryptionKey: key,
  };
}

export function linkedInConfig(env: NodeJS.ProcessEnv = process.env): SocialProviderConfig {
  const missing: string[] = LINKEDIN_ENV_VARS.filter((key) => !env[key]?.trim());
  const redirectUri = env.LINKEDIN_REDIRECT_URI?.trim() || null;
  if (redirectUri && !redirectUri.endsWith(LINKEDIN_CALLBACK_PATH) && !missing.includes("LINKEDIN_REDIRECT_URI")) {
    missing.push("LINKEDIN_REDIRECT_URI");
  }
  const key = encryptionKey(env, missing);
  return {
    ready: missing.length === 0 && key != null,
    missing,
    clientId: env.LINKEDIN_CLIENT_ID?.trim() || null,
    clientSecret: env.LINKEDIN_CLIENT_SECRET?.trim() || null,
    redirectUri,
    encryptionKey: key,
  };
}

export function metaAuthorizeUrl(config: SocialProviderConfig, state: string): string {
  if (!config.ready || !config.clientId || !config.redirectUri) throw new Error("Invalid social: Meta credentials are not configured");
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_SCOPES.join(","));
  return url.toString();
}

export function linkedInAuthorizeUrl(config: SocialProviderConfig, state: string): string {
  if (!config.ready || !config.clientId || !config.redirectUri) throw new Error("Invalid social: LinkedIn credentials are not configured");
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  return url.toString();
}

export function socialOAuthState(input: { businessId: string; employeeId: string }, secret: string): string {
  return signOAuthState(input, secret);
}

export function readSocialOAuthState(token: string, secret: string) {
  return verifyOAuthState(token, secret);
}

export function sealSocialToken(token: string, key: Buffer): string {
  return encryptSecret(token, key);
}

export function openSocialToken(payload: string, key: Buffer): string {
  return decryptSecret(payload, key);
}

export function safeSocialMessage(value: string): string {
  return value
    .replace(/access_token[\s:=]+[^\s,&]+/gi, "access_token=[redacted]")
    .replace(/refresh_token[\s:=]+[^\s,&]+/gi, "refresh_token=[redacted]")
    .replace(/client_secret[\s:=]+[^\s,&]+/gi, "client_secret=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .slice(0, 300);
}

export function socialAuditDetails(input: {
  kind: string;
  postId?: string;
  platform?: string;
  connectionId?: string;
  externalId?: string;
  results?: { platform: string; status: string; error?: string | null }[];
  error?: string;
}) {
  return {
    kind: input.kind,
    postId: input.postId,
    platform: input.platform,
    connectionId: input.connectionId,
    externalId: input.externalId,
    results: input.results?.map((result) => ({
      platform: result.platform,
      status: result.status,
      error: result.error ? safeSocialMessage(result.error) : undefined,
    })),
    error: input.error ? safeSocialMessage(input.error) : undefined,
  };
}
