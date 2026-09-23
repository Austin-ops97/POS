import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { mergeCredentialEnv } from "@/lib/credentials/catalog";
import { platformIssue, retryableDeliveryIds, socialPostWhere, summarizeDeliveries } from "./plan";
import {
  linkedInAuthorizeUrl,
  linkedInConfig,
  metaAuthorizeUrl,
  metaConfig,
  safeSocialMessage,
  socialAuditDetails,
  socialConnectGate,
} from "./providers";

const emptyEnv = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

describe("social publishing", () => {
  it("keeps a successful publish when one platform fails", () => {
    const status = summarizeDeliveries(["PUBLISHED", "PUBLISHED", "FAILED"]);
    assert.equal(status, "PARTIAL");
    const retry = retryableDeliveryIds([
      { id: "fb", status: "PUBLISHED" },
      { id: "ig", status: "PUBLISHED" },
      { id: "li", status: "FAILED" },
    ]);
    assert.deepEqual(retry, ["li"]);
  });

  it("blocks Instagram without an image and LinkedIn over its character limit", () => {
    assert.match(platformIssue("INSTAGRAM", { text: "Hello", link: null, hasImage: false }) ?? "", /Instagram/);
    assert.equal(platformIssue("FACEBOOK", { text: "Hello", link: null, hasImage: false }), null);
    assert.match(platformIssue("LINKEDIN", { text: "a".repeat(3001), link: null, hasImage: false }) ?? "", /3000/);
  });

  it("omits access tokens from audit details", () => {
    const secret = "EAABsuper-secret-token";
    const details = socialAuditDetails({
      kind: "SOCIAL_PUBLISHED",
      postId: "post-1",
      results: [{ platform: "LINKEDIN", status: "FAILED", error: `auth expired access_token=${secret}` }],
    });
    const serialized = JSON.stringify(details);
    assert.equal(serialized.includes(secret), false);
    assert.match(serialized, /access_token=\[redacted\]/);
    assert.equal(safeSocialMessage(`Bearer ${secret}`).includes(secret), false);
  });

  it("scopes posts to one business and lists missing provider env vars", () => {
    const where = socialPostWhere("biz-a", { status: "SCHEDULED" });
    assert.equal(where.businessId, "biz-a");
    assert.notEqual(socialPostWhere("biz-b").businessId, where.businessId);
    assert.deepEqual([...metaConfig(emptyEnv).missing], ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI", "SOCIAL_TOKEN_ENCRYPTION_KEY"]);
    assert.equal(metaConfig(emptyEnv).ready, false);
    assert.deepEqual([...linkedInConfig(emptyEnv).missing], [
      "LINKEDIN_CLIENT_ID",
      "LINKEDIN_CLIENT_SECRET",
      "LINKEDIN_REDIRECT_URI",
      "SOCIAL_TOKEN_ENCRYPTION_KEY",
    ]);
    assert.equal(linkedInConfig(emptyEnv).ready, false);
  });

  it("opens Connect from vault credentials and keeps env var names out of the business gate", () => {
    const key = randomBytes(32).toString("base64");
    const host = { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://emerald.example" } as NodeJS.ProcessEnv;
    const blocked = socialConnectGate(metaConfig(host), "meta");
    assert.equal(blocked.allow, false);
    if (!blocked.allow) {
      assert.match(blocked.message, /\/admin\/builder/);
      assert.match(blocked.message, /Platform credentials/);
      assert.equal(/META_APP_ID/.test(blocked.message), false);
      assert.equal(/vercel/i.test(blocked.message), false);
    }
    const linkedBlocked = socialConnectGate(linkedInConfig(host), "linkedin");
    assert.equal(linkedBlocked.allow, false);
    if (!linkedBlocked.allow) {
      assert.match(linkedBlocked.message, /\/admin\/builder/);
      assert.equal(/LINKEDIN_CLIENT_ID/.test(linkedBlocked.message), false);
    }

    const merged = mergeCredentialEnv(host, {
      META_APP_ID: "meta-app",
      META_APP_SECRET: "meta-secret",
      SOCIAL_TOKEN_ENCRYPTION_KEY: key,
      LINKEDIN_CLIENT_ID: "li-client",
      LINKEDIN_CLIENT_SECRET: "li-secret",
    });
    const meta = metaConfig(merged);
    assert.equal(meta.ready, true);
    assert.deepEqual(meta.missing, []);
    assert.equal(meta.redirectUri, "https://emerald.example/api/integrations/meta/callback");
    assert.equal(meta.clientId, "meta-app");
    assert.equal(meta.clientSecret, "meta-secret");
    assert.equal(socialConnectGate(meta, "meta").allow, true);
    const linked = linkedInConfig(merged);
    assert.equal(linked.ready, true);
    assert.equal(linked.redirectUri, "https://emerald.example/api/integrations/linkedin/callback");
    assert.equal(socialConnectGate(linked, "linkedin").allow, true);

    const metaUrl = new URL(metaAuthorizeUrl(meta, "state-1"));
    assert.equal(metaUrl.origin + metaUrl.pathname, "https://www.facebook.com/v21.0/dialog/oauth");
    assert.equal(metaUrl.searchParams.get("client_id"), "meta-app");
    assert.equal(metaUrl.searchParams.get("redirect_uri"), meta.redirectUri);
    assert.equal(metaUrl.searchParams.get("state"), "state-1");
    assert.match(metaUrl.searchParams.get("scope") || "", /pages_manage_posts/);
    assert.match(metaUrl.searchParams.get("scope") || "", /instagram_content_publish/);

    const linkedUrl = new URL(linkedInAuthorizeUrl(linked, "state-2"));
    assert.equal(linkedUrl.origin + linkedUrl.pathname, "https://www.linkedin.com/oauth/v2/authorization");
    assert.equal(linkedUrl.searchParams.get("client_id"), "li-client");
    assert.equal(linkedUrl.searchParams.get("redirect_uri"), linked.redirectUri);
    assert.match(linkedUrl.searchParams.get("scope") || "", /w_member_social/);
    assert.match(linkedUrl.searchParams.get("scope") || "", /w_organization_social/);

    const bad = metaConfig({ ...merged, META_REDIRECT_URI: "https://evil.example/steal" });
    assert.equal(bad.ready, false);
    assert.equal(bad.redirectUri, null);
    assert.equal(bad.missing.includes("META_REDIRECT_URI"), true);
  });

  it("keeps social connect on the vault helper and hides missing keys from business users", () => {
    const root = process.cwd();
    const service = fs.readFileSync(path.join(root, "src/lib/social/social-service.ts"), "utf8");
    const load = fs.readFileSync(path.join(root, "src/lib/credentials/load.ts"), "utf8");
    const page = fs.readFileSync(path.join(root, "src/app/(dashboard)/settings/integrations/social/page.tsx"), "utf8");
    const panel = fs.readFileSync(path.join(root, "src/components/settings/social-center.tsx"), "utf8");
    const builder = fs.readFileSync(path.join(root, "src/components/admin/platform-credentials.tsx"), "utf8");
    assert.match(service, /loadMetaConfig/);
    assert.match(service, /loadLinkedInConfig/);
    assert.match(service, /socialConnectGate/);
    assert.equal(service.includes("process.env.META_"), false);
    assert.equal(service.includes("process.env.LINKEDIN_"), false);
    assert.match(load, /getPlatformCredential/);
    assert.match(load, /META_ENV_VARS/);
    assert.match(load, /LINKEDIN_ENV_VARS/);
    assert.equal(page.includes("process.env"), false);
    assert.match(page, /isPlatformAdmin/);
    assert.match(service, /missing: admin \? meta\.missing : \[\]/);
    assert.match(service, /redirectUri: admin \? meta\.redirectUri : null/);
    assert.match(panel, /\/admin\/builder/);
    assert.match(panel, /isPlatformAdmin && provider\.missing\.length > 0/);
    assert.equal(panel.includes("process.env"), false);
    assert.match(builder, /Valid OAuth Redirect URIs/);
    assert.match(builder, /Authorized redirect URLs/);
    assert.match(builder, /\/api\/integrations\/meta\/callback/);
    assert.match(builder, /\/api\/integrations\/linkedin\/callback/);
  });
});
