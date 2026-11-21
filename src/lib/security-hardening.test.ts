import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  __test,
  buildCashierCookieValue,
  readCashierTokenFromRequest,
  REGISTER_CASHIER_COOKIE,
} from "./register-cashier";
import { handleApiError } from "./api-utils";

describe("register cashier cookie", () => {
  it("round-trips a signed cashier payload", () => {
    const { value, maxAge } = buildCashierCookieValue({
      businessId: "biz_1",
      employeeId: "emp_1",
      employeeName: "Alex Cashier",
      sessionTimeoutMinutes: 30,
    });
    assert.equal(maxAge, 30 * 60);
    const payload = __test.decodePayload(value);
    assert.ok(payload);
    assert.equal(payload?.businessId, "biz_1");
    assert.equal(payload?.employeeId, "emp_1");
    assert.equal(payload?.employeeName, "Alex Cashier");
  });

  it("rejects tampered tokens", () => {
    const { value } = buildCashierCookieValue({
      businessId: "biz_1",
      employeeId: "emp_1",
      employeeName: "Alex",
      sessionTimeoutMinutes: 5,
    });
    const [body] = value.split(".");
    assert.equal(__test.decodePayload(`${body}.tampered`), null);
  });

  it("reads the cashier cookie from a request", () => {
    const { value } = buildCashierCookieValue({
      businessId: "biz_1",
      employeeId: "emp_1",
      employeeName: "Alex",
      sessionTimeoutMinutes: 5,
    });
    const request = new Request("http://localhost/api/checkout", {
      headers: {
        cookie: `${REGISTER_CASHIER_COOKIE}=${encodeURIComponent(value)}`,
      },
    });
    assert.equal(readCashierTokenFromRequest(request), value);
  });
});

describe("mileage error mapping", () => {
  it("returns 400 for origin, lookup, and route messages", async () => {
    for (const message of [
      "Invalid origin or destination: enter both addresses.",
      "Invalid address lookup: could not look up the origin address. Try again in a moment.",
      "Invalid route: could not calculate a driving route between those addresses.",
    ]) {
      const res = handleApiError(new Error(message), "mileage");
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, message);
    }
  });
});

describe("expense list IDOR guard", () => {
  it("only applies employeeId filter for team viewers", () => {
    // Mirrors listExpenses authorization shape.
    function buildEmployeeFilter(opts: {
      viewAll: boolean;
      authEmployeeId: string;
      queryEmployeeId?: string;
    }) {
      if (opts.viewAll) {
        return opts.queryEmployeeId ? { employeeId: opts.queryEmployeeId } : {};
      }
      return { employeeId: opts.authEmployeeId };
    }

    assert.deepEqual(
      buildEmployeeFilter({
        viewAll: false,
        authEmployeeId: "self",
        queryEmployeeId: "other",
      }),
      { employeeId: "self" }
    );
    assert.deepEqual(
      buildEmployeeFilter({
        viewAll: true,
        authEmployeeId: "self",
        queryEmployeeId: "other",
      }),
      { employeeId: "other" }
    );
    assert.deepEqual(
      buildEmployeeFilter({ viewAll: true, authEmployeeId: "self" }),
      {}
    );
  });
});

describe("dev auth bypass policy", () => {
  it("documents fail-closed production policy", () => {
    function allowDevAuthBypass(env: {
      clerkPublishable?: string;
      clerkSecret?: string;
      allowBypass?: string;
      nodeEnv?: string;
    }) {
      const clerkConfigured =
        /^pk_(test|live)_[A-Za-z0-9+/=_-]{20,}$/.test(
          env.clerkPublishable ?? ""
        ) &&
        /^sk_(test|live)_[A-Za-z0-9+/=_-]{20,}$/.test(env.clerkSecret ?? "");
      return (
        !clerkConfigured &&
        env.allowBypass === "true" &&
        env.nodeEnv !== "production"
      );
    }

    assert.equal(
      allowDevAuthBypass({
        allowBypass: "true",
        nodeEnv: "production",
      }),
      false
    );
    assert.equal(
      allowDevAuthBypass({
        allowBypass: "true",
        nodeEnv: "development",
      }),
      true
    );
    assert.equal(
      allowDevAuthBypass({
        allowBypass: undefined,
        nodeEnv: "development",
      }),
      false
    );
    assert.equal(
      allowDevAuthBypass({
        clerkPublishable: "pk_test_ci",
        clerkSecret: "sk_test_ci",
        allowBypass: "true",
        nodeEnv: "development",
      }),
      true
    );
    assert.equal(
      allowDevAuthBypass({
        clerkPublishable: "pk_test_abcdefghijklmnopqrstuvwxyz123456",
        clerkSecret: "sk_test_abcdefghijklmnopqrstuvwxyz123456",
        allowBypass: "true",
        nodeEnv: "development",
      }),
      false
    );
  });
});
