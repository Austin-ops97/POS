import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { platformIssue, retryableDeliveryIds, socialPostWhere, summarizeDeliveries } from "./plan";
import { linkedInConfig, metaConfig, safeSocialMessage, socialAuditDetails } from "./providers";

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
});
