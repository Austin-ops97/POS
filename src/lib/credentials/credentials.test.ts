import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "crypto";
import { describe, it } from "node:test";
import { plaidConfig } from "@/lib/banking/plaid";
import { safeBuilderAuditDetails } from "@/lib/builder/audit";
import { builderGateDecision } from "@/lib/builder/gate-decision";
import { intuitConfig } from "@/lib/integrations/quickbooks";
import { linkedInConfig, metaConfig } from "@/lib/social/providers";
import {
  credentialHint,
  masterKeyState,
  mergeCredentialEnv,
  openVaultValue,
  planProviderWrite,
  projectPlatformCredentials,
  providerClearKeys,
  readPlatformCredential,
  sealVaultValue,
} from "./catalog";
import { getPlatformCredential } from "./vault";

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

const emptyEnv = env();

describe("platform credential vault", () => {
  it("encrypts and decrypts a provider secret with the master key", () => {
    const key = randomBytes(32);
    const plain = "meta-app-secret-value";
    const sealed = sealVaultValue(plain, key);
    assert.equal(sealed.includes(plain), false);
    assert.equal(openVaultValue(sealed, key), plain);
    const tampered = Buffer.from(sealed, "base64");
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => openVaultValue(tampered.toString("base64"), key));
    assert.equal(masterKeyState(env({ CREDENTIALS_ENCRYPTION_KEY: key.toString("base64") })), "ok");
    assert.equal(masterKeyState(emptyEnv), "missing");
    assert.equal(masterKeyState(env({ CREDENTIALS_ENCRYPTION_KEY: "short" })), "invalid");
    assert.equal(credentialHint(plain), "alue");
    assert.equal(credentialHint("short"), null);
  });

  it("reads the vault before process.env", async () => {
    const host = env({ META_APP_ID: "from-env", PLAID_SECRET: "env-plaid-secret" });
    assert.equal(readPlatformCredential("META_APP_ID", {}, host), "from-env");
    assert.equal(readPlatformCredential("META_APP_ID", { META_APP_ID: "from-vault" }, host), "from-vault");
    assert.equal(readPlatformCredential("ABSENT", {}, host), null);
    assert.equal(await getPlatformCredential("META_APP_ID", { vault: {}, env: host }), "from-env");
    assert.equal(await getPlatformCredential("META_APP_ID", { vault: { META_APP_ID: "from-vault" }, env: host }), "from-vault");
    assert.equal(await getPlatformCredential("PLAID_SECRET", { vault: { PLAID_SECRET: "" }, env: host }), "env-plaid-secret");
  });

  it("treats vault credentials as present for connect gates", () => {
    const tokenKey = randomBytes(32).toString("base64");
    const vault = {
      META_APP_ID: "meta-app-id",
      META_APP_SECRET: "meta-app-secret-value",
      META_REDIRECT_URI: "https://emerald.example/api/integrations/meta/callback",
      LINKEDIN_CLIENT_ID: "linkedin-client",
      LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
      LINKEDIN_REDIRECT_URI: "https://emerald.example/api/integrations/linkedin/callback",
      SOCIAL_TOKEN_ENCRYPTION_KEY: tokenKey,
      PLAID_CLIENT_ID: "plaid-client",
      PLAID_SECRET: "plaid-secret-value",
      PLAID_ENV: "sandbox",
      PLAID_TOKEN_ENCRYPTION_KEY: tokenKey,
      INTUIT_CLIENT_ID: "intuit-client",
      INTUIT_CLIENT_SECRET: "intuit-client-secret",
      INTUIT_REDIRECT_URI: "https://emerald.example/api/integrations/quickbooks/callback",
      INTUIT_ENVIRONMENT: "sandbox",
      INTUIT_TOKEN_ENCRYPTION_KEY: tokenKey,
    };
    assert.equal(metaConfig(emptyEnv).ready, false);
    assert.equal(plaidConfig(emptyEnv).ready, false);
    assert.equal(intuitConfig(emptyEnv).ready, false);
    const merged = mergeCredentialEnv(emptyEnv, vault);
    assert.equal(metaConfig(merged).ready, true);
    assert.deepEqual([...metaConfig(merged).missing], []);
    assert.equal(linkedInConfig(merged).ready, true);
    assert.equal(plaidConfig(merged).ready, true);
    assert.equal(plaidConfig(merged).environment, "sandbox");
    assert.equal(intuitConfig(merged).ready, true);
    assert.equal(metaConfig(merged).clientSecret, "meta-app-secret-value");

    const view = projectPlatformCredentials({ vault, env: emptyEnv });
    const encoded = JSON.stringify(view);
    assert.equal(encoded.includes("meta-app-secret-value"), false);
    assert.equal(encoded.includes("plaid-secret-value"), false);
    assert.equal(encoded.includes("intuit-client-secret"), false);
    assert.equal(encoded.includes("linkedin-client-secret"), false);
    assert.equal(encoded.includes(tokenKey), false);
    const meta = view.providers.find((provider) => provider.id === "meta");
    assert.equal(meta?.configured, true);
    assert.deepEqual(meta?.missing, []);
    assert.equal(meta?.whitelistRedirect, "https://emerald.example/api/integrations/meta/callback");
    const secret = meta?.fields.find((field) => field.key === "META_APP_SECRET");
    assert.equal(secret?.value, null);
    assert.equal(secret?.secret, true);
    assert.equal(secret?.hint, "alue");
    assert.equal(secret?.source, "vault");
  });

  it("suggests a redirect, generates a token key, and refuses unknown keys", () => {
    const plan = planProviderWrite({
      provider: "meta",
      incoming: { META_APP_ID: "123456789012", META_APP_SECRET: "supersecretvalue" },
      vault: {},
      env: env({ NEXT_PUBLIC_APP_URL: "https://emerald.example/app" }),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.upserts.META_REDIRECT_URI, "https://emerald.example/api/integrations/meta/callback");
    assert.equal(Buffer.from(plan.upserts.SOCIAL_TOKEN_ENCRYPTION_KEY, "base64").length, 32);

    const again = planProviderWrite({
      provider: "linkedin",
      incoming: { LINKEDIN_CLIENT_ID: "abc", LINKEDIN_CLIENT_SECRET: "linkedinsecretvalue" },
      vault: { SOCIAL_TOKEN_ENCRYPTION_KEY: plan.upserts.SOCIAL_TOKEN_ENCRYPTION_KEY },
      env: env({ NEXT_PUBLIC_APP_URL: "https://emerald.example" }),
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.upserts.SOCIAL_TOKEN_ENCRYPTION_KEY, undefined);

    const badRedirect = planProviderWrite({
      provider: "meta",
      incoming: {
        META_APP_ID: "123456789012",
        META_APP_SECRET: "supersecretvalue",
        META_REDIRECT_URI: "https://evil.example/callback",
      },
      vault: {},
      env: emptyEnv,
    });
    assert.equal(badRedirect.ok, false);

    const unknown = planProviderWrite({
      provider: "plaid",
      incoming: { PLAID_CLIENT_ID: "id", PLAID_SECRET: "plaidsecretvalue", CLERK_SECRET_KEY: "sk_test_should_not_store" },
      vault: {},
      env: emptyEnv,
    });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.match(unknown.error, /CLERK_SECRET_KEY/);

    assert.equal(providerClearKeys("meta").includes("SOCIAL_TOKEN_ENCRYPTION_KEY"), false);
    assert.deepEqual(providerClearKeys("plaid"), ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_REDIRECT_URI", "PLAID_ENV"]);

    const plaidPlan = planProviderWrite({
      provider: "plaid",
      incoming: { PLAID_CLIENT_ID: "id", PLAID_SECRET: "plaidsecretvalue" },
      vault: {},
      env: env({ NEXT_PUBLIC_APP_URL: "https://emerald.example" }),
    });
    assert.equal(plaidPlan.ok, true);
    if (!plaidPlan.ok) return;
    assert.equal(plaidPlan.upserts.PLAID_REDIRECT_URI, "https://emerald.example/settings/integrations/banking");
    assert.equal(plaidPlan.upserts.PLAID_ENV, "sandbox");
    assert.equal(Buffer.from(plaidPlan.upserts.PLAID_TOKEN_ENCRYPTION_KEY, "base64").length, 32);
    const plaidView = projectPlatformCredentials({
      vault: plaidPlan.upserts,
      env: env({ NEXT_PUBLIC_APP_URL: "https://emerald.example" }),
    });
    const plaid = plaidView.providers.find((provider) => provider.id === "plaid");
    assert.equal(plaid?.configured, true);
    assert.equal(plaid?.suggestedWebhook, "https://emerald.example/api/webhooks/plaid");
    assert.equal(plaid?.whitelistRedirect, "https://emerald.example/settings/integrations/banking");
    assert.equal(JSON.stringify(plaidView).includes("plaidsecretvalue"), false);
  });

  it("denies the credential vault to someone who is not a platform admin", () => {
    const decision = builderGateDecision({
      authenticated: true,
      isPlatformAdmin: false,
      unlockConfigured: true,
      unlockValid: true,
    });
    assert.equal(decision.allow, false);
    if (!decision.allow) {
      assert.equal(decision.status, 403);
      assert.equal(decision.code, "FORBIDDEN");
    }
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/builder/credentials/route.ts"), "utf8");
    assert.match(route, /requireBuilder\(/);
    assert.equal(route.includes("NEXT_PUBLIC_"), false);
    const details = safeBuilderAuditDetails({
      provider: "meta",
      fields: ["META_APP_ID", "META_APP_SECRET"],
      META_APP_SECRET: "super-secret-value",
    });
    const encoded = JSON.stringify(details);
    assert.equal(encoded.includes("super-secret-value"), false);
    assert.match(encoded, /META_APP_SECRET/);
    assert.match(encoded, /META_APP_ID/);
  });
});
