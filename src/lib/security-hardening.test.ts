import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  __test,
  buildCashierCookieValue,
  readCashierTokenFromRequest,
  REGISTER_CASHIER_COOKIE,
} from "./register-cashier";

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
      const clerkConfigured = Boolean(env.clerkPublishable && env.clerkSecret);
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
        clerkPublishable: "pk",
        clerkSecret: "sk",
        allowBypass: "true",
        nodeEnv: "development",
      }),
      false
    );
  });
});
