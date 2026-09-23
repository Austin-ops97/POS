import { PLAID_RUNTIME_KEYS, plaidConfig } from "@/lib/banking/plaid";
import { INTUIT_ENV_VARS, intuitConfig } from "@/lib/integrations/quickbooks";
import { LINKEDIN_ENV_VARS, META_ENV_VARS, linkedInConfig, metaConfig } from "@/lib/social/providers";
import { getPlatformCredential } from "./vault";

async function envWithCredentials(keys: readonly string[]): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of keys) {
    const value = await getPlatformCredential(key);
    if (value) env[key] = value;
  }
  return env;
}

export async function loadMetaConfig() {
  return metaConfig(await envWithCredentials(META_ENV_VARS));
}

export async function loadLinkedInConfig() {
  return linkedInConfig(await envWithCredentials(LINKEDIN_ENV_VARS));
}

export async function loadPlaidConfig() {
  const env = await envWithCredentials(PLAID_RUNTIME_KEYS);
  return plaidConfig(env);
}

export async function loadIntuitConfig() {
  const env = await envWithCredentials([...INTUIT_ENV_VARS, "INTUIT_ENVIRONMENT"]);
  return intuitConfig(env);
}
