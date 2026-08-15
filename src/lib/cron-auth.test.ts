import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { authorizeCron } from "./cron-auth";

const original = process.env.CRON_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("authorizeCron", () => {
  it("returns 503 when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const res = authorizeCron(new Request("http://localhost/api/cron/pto-accrual"));
    assert.ok(res);
    assert.equal(res!.status, 503);
  });

  it("returns 401 for a missing or wrong bearer token", async () => {
    process.env.CRON_SECRET = "test-secret";
    const missing = authorizeCron(new Request("http://localhost/api/cron/pto-accrual"));
    assert.equal(missing!.status, 401);

    const wrong = authorizeCron(
      new Request("http://localhost/api/cron/pto-accrual", {
        headers: { authorization: "Bearer other" },
      })
    );
    assert.equal(wrong!.status, 401);
  });

  it("allows the configured bearer token", () => {
    process.env.CRON_SECRET = "test-secret";
    const res = authorizeCron(
      new Request("http://localhost/api/cron/pto-accrual", {
        headers: { authorization: "Bearer test-secret" },
      })
    );
    assert.equal(res, null);
  });
});
