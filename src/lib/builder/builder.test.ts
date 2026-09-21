import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { enforceBusinessModule } from "../module-entitlement";
import { moduleForPath } from "../module-routes";
import { safeBuilderAuditDetails } from "./audit";
import { builderGateDecision } from "./gate-decision";
import { resolveFeatureFlags } from "./entitlements";
import { moduleFlagsForPlan, planDiverged, BUILDER_FEATURE_GROUPS } from "./plans";
import { MODULE_SETTING_KEYS } from "../validations";
import { platformIntegrationStatus, publicBusinessConnections } from "./connections";
import {
  isBuilderUnlockConfigured,
  readBuilderUnlockPayload,
  secretsMatch,
  signBuilderUnlock,
  unlockFailureMessage,
  verifyBuilderUnlock,
} from "./unlock-token";

const SECRET = "builder-test-secret-value";

describe("builder unlock gate", () => {
  it("rejects a non-platform-admin even when an unlock cookie would be valid", () => {
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
  });

  it("requires a valid unlock after the platform-admin check", () => {
    const locked = builderGateDecision({
      authenticated: true,
      isPlatformAdmin: true,
      unlockConfigured: true,
      unlockValid: false,
    });
    assert.equal(locked.allow, false);
    if (!locked.allow) assert.equal(locked.code, "BUILDER_LOCKED");

    const open = builderGateDecision({
      authenticated: true,
      isPlatformAdmin: true,
      unlockConfigured: true,
      unlockValid: true,
    });
    assert.equal(open.allow, true);
  });

  it("signs a session flag that does not contain the secret", () => {
    const { value } = signBuilderUnlock("user_1", SECRET, 1_700_000_000_000);
    assert.equal(value.includes(SECRET), false);
    const payload = readBuilderUnlockPayload(value, SECRET);
    assert.deepEqual(payload && Object.keys(payload).sort(), ["exp", "purpose", "uid"]);
    assert.equal(verifyBuilderUnlock(value, SECRET, "user_1", 1_700_000_000_000), true);
    assert.equal(verifyBuilderUnlock(value, SECRET, "other_user", 1_700_000_000_000), false);
    assert.equal(verifyBuilderUnlock(value, "another-long-secret-value", "user_1", 1_700_000_000_000), false);
    assert.equal(verifyBuilderUnlock(value, SECRET, "user_1", payload!.exp + 1), false);
    const [body] = value.split(".");
    assert.equal(readBuilderUnlockPayload(`${body}.tampered`, SECRET), null);
  });

  it("compares secrets without throwing on length mismatch and uses a generic failure message", () => {
    assert.equal(secretsMatch("short", SECRET), false);
    assert.equal(secretsMatch(SECRET, SECRET), true);
    const message = unlockFailureMessage("mismatch");
    assert.equal(message.error, "Unlock failed.");
    assert.equal(message.error.includes(SECRET), false);
    assert.equal(unlockFailureMessage("rate_limited").status, 429);
    assert.equal(isBuilderUnlockConfigured({ BUILDER_UNLOCK_SECRET: "too-short" }), false);
    assert.equal(isBuilderUnlockConfigured({ BUILDER_UNLOCK_SECRET: SECRET }), true);
  });

  it("drops secrets from audit details", () => {
    const details = safeBuilderAuditDetails({
      secret: SECRET,
      unlockSecret: SECRET,
      module: "POS",
      nested: { accessToken: "tok_live_should_not_remain", enabled: true },
    });
    const encoded = JSON.stringify(details);
    assert.equal(encoded.includes(SECRET), false);
    assert.equal(encoded.includes("tok_live_should_not_remain"), false);
    assert.match(encoded, /POS/);
  });
});

describe("builder entitlements", () => {
  it("blocks a disabled module and grandfathers a missing row", () => {
    assert.throws(() => enforceBusinessModule({ enabled: false }, "PAYROLL"), /Module disabled: PAYROLL/);
    assert.doesNotThrow(() => enforceBusinessModule(null, "PAYROLL"));
    assert.doesNotThrow(() => enforceBusinessModule({ enabled: true }, "PAYROLL"));
  });

  it("resolves missing flags as on and explicit flags as stored", () => {
    const flags = resolveFeatureFlags([{ module: "PAYROLL", enabled: false }]);
    assert.equal(flags.PAYROLL, false);
    assert.equal(flags.POS, true);
    assert.equal(resolveFeatureFlags([]).SOCIAL, true);
  });

  it("applies plan bundles and still allows an override to diverge", () => {
    const starter = moduleFlagsForPlan("STARTER");
    assert.equal(starter.POS, true);
    assert.equal(starter.INVENTORY, true);
    assert.equal(starter.PAYROLL, false);
    assert.equal(starter.SOCIAL, false);
    assert.equal(starter.QUICKBOOKS, false);
    assert.equal(planDiverged("STARTER", starter), false);

    const overridden = { ...starter, PAYROLL: true };
    assert.equal(planDiverged("STARTER", overridden), true);

    const enterprise = moduleFlagsForPlan("ENTERPRISE");
    assert.equal(enterprise.PAYROLL, true);
    assert.equal(enterprise.SOCIAL, true);
    assert.equal(enterprise.QUICKBOOKS, true);
    assert.equal(enterprise.GIFT_CARDS, false);
    const grouped = BUILDER_FEATURE_GROUPS.flatMap((group) => [...group.keys]).sort();
    assert.deepEqual(grouped, [...MODULE_SETTING_KEYS].sort());
  });

  it("stamps payroll, accounting, and projects separately from their parent modules", () => {
    assert.equal(moduleForPath("/api/workforce/payroll/runs"), "PAYROLL");
    assert.equal(moduleForPath("/api/workforce/time-clock"), "WORKFORCE");
    assert.equal(moduleForPath("/finance/reports/profit-loss"), "ACCOUNTING");
    assert.equal(moduleForPath("/finance/expenses"), "EXPENSES");
    assert.equal(moduleForPath("/api/office/workspaces/projects/records"), "PROJECTS");
    assert.equal(moduleForPath("/api/office/projects/proj_1/reminders"), "PROJECT_REMINDERS");
    assert.equal(moduleForPath("/api/import/batches"), "IMPORT");
    assert.equal(moduleForPath("/api/integrations/plaid/link-token"), "BANKING");
    assert.equal(moduleForPath("/api/social/posts"), "SOCIAL");
  });
});

describe("builder connections", () => {
  it("reports credential presence without echoing secret values", () => {
    const secret = "sk_test_supersecretvalue1234567890";
    const status = platformIntegrationStatus({
      STRIPE_SECRET_KEY: secret,
      STRIPE_WEBHOOK_SECRET: "whsec_should_not_appear",
      INTUIT_CLIENT_SECRET: "intuit-secret-value",
      PLAID_SECRET: "plaid-secret-value",
      META_APP_SECRET: "meta-secret-value",
      SOCIAL_TOKEN_ENCRYPTION_KEY: "social-key-value",
    });
    const encoded = JSON.stringify(status);
    assert.equal(encoded.includes(secret), false);
    assert.equal(encoded.includes("whsec_should_not_appear"), false);
    assert.equal(encoded.includes("intuit-secret-value"), false);
    assert.equal(encoded.includes("plaid-secret-value"), false);
    assert.equal(encoded.includes("meta-secret-value"), false);
    const stripe = status.find((row) => row.id === "stripe");
    assert.equal(stripe?.status, "configured");
    assert.match(stripe?.detail || "", /Secret key set/);
  });

  it("publishes connection status without tokens", () => {
    const rows = publicBusinessConnections({
      stripe: { status: "CONNECTED", chargesEnabled: true, payoutsEnabled: false },
      quickbooks: { status: "ERROR", companyName: "Vale", lastSyncError: "Bearer super-token-value failed" },
      bank: { status: "DISCONNECTED", institutionName: null, lastSyncError: null },
      social: [{ platform: "LINKEDIN", status: "CONNECTED", displayName: "Emerald Vale", lastSyncError: null }],
    });
    const encoded = JSON.stringify(rows);
    assert.equal(encoded.includes("super-token-value"), false);
    assert.match(encoded, /Bearer \[redacted\]/);
    assert.equal(rows.find((row) => row.id === "quickbooks-business")?.status, "error");
    assert.equal(rows.find((row) => row.id === "plaid-business")?.status, "not_connected");
    assert.equal(rows.find((row) => row.id === "social-business")?.status, "connected");
  });
});

describe("builder route gates", () => {
  it("checks platform admin and unlock on every builder route", () => {
    const root = path.join(process.cwd(), "src/app/api/builder");
    const files = walk(root);
    assert.ok(files.length >= 8);
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const relative = path.relative(root, file);
      const sessionGate = /\/(session|unlock|lock)\//.test(`/${relative}`);
      if (sessionGate) {
        assert.match(text, /getAuthUser|requirePlatformAdmin/);
      } else {
        assert.match(text, /requireBuilder\(/);
      }
      assert.equal(text.includes("NEXT_PUBLIC_BUILDER"), false);
    }
  });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}
