import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClerkConfigured,
  isClerkPublishableKey,
  isClerkSecretKey,
} from "./clerk-config";

describe("clerk key detection", () => {
  it("rejects dummy CI placeholders", () => {
    assert.equal(isClerkPublishableKey("pk_test_ci"), false);
    assert.equal(isClerkSecretKey("sk_test_ci"), false);
    assert.equal(isClerkPublishableKey("pk"), false);
    assert.equal(isClerkSecretKey("sk"), false);
    assert.equal(isClerkPublishableKey(""), false);
    assert.equal(isClerkPublishableKey(undefined), false);
  });

  it("accepts real-shaped Clerk keys", () => {
    assert.equal(
      isClerkPublishableKey("pk_test_abcdefghijklmnopqrstuvwxyz123456"),
      true
    );
    assert.equal(
      isClerkSecretKey("sk_test_abcdefghijklmnopqrstuvwxyz123456"),
      true
    );
  });

  it("requires both env keys to look real", () => {
    const prevPk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const prevSk = process.env.CLERK_SECRET_KEY;
    try {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_ci";
      process.env.CLERK_SECRET_KEY = "sk_test_ci";
      assert.equal(isClerkConfigured(), false);

      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
        "pk_test_abcdefghijklmnopqrstuvwxyz123456";
      process.env.CLERK_SECRET_KEY =
        "sk_test_abcdefghijklmnopqrstuvwxyz123456";
      assert.equal(isClerkConfigured(), true);
    } finally {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = prevPk;
      process.env.CLERK_SECRET_KEY = prevSk;
    }
  });
});
