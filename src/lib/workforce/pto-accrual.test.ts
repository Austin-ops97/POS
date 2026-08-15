import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accrualPeriodKey,
  carryoverHoursToForfeit,
  currentAnnualGrantYear,
  hoursForAccrualPeriod,
  openingPtoGrant,
  planEmployeeAccrual,
} from "./pto-accrual";

describe("PTO accrual planner", () => {
  it("splits annual hours across pay periods and months", () => {
    assert.equal(hoursForAccrualPeriod("ANNUAL_GRANT", 80, "BIWEEKLY"), 80);
    assert.equal(hoursForAccrualPeriod("MONTHLY", 80, "MONTHLY"), 6.67);
    assert.equal(hoursForAccrualPeriod("PER_PAY_PERIOD", 80, "BIWEEKLY"), 3.08);
    assert.equal(hoursForAccrualPeriod("NONE", 80, "WEEKLY"), 0);
  });

  it("uses hire-date anniversary for annual grant year", () => {
    const now = new Date("2026-08-15T08:15:00.000Z");
    assert.equal(currentAnnualGrantYear(now, null), 2026);
    assert.equal(currentAnnualGrantYear(now, new Date("2024-06-15T00:00:00.000Z")), 2026);
    assert.equal(currentAnnualGrantYear(now, new Date("2024-12-01T00:00:00.000Z")), 2025);
  });

  it("builds stable period keys", () => {
    const now = new Date("2026-08-15T08:15:00.000Z");
    assert.equal(
      accrualPeriodKey({ policy: "ANNUAL_GRANT", now }),
      "pto-accrual:year:2026"
    );
    assert.equal(
      accrualPeriodKey({ policy: "MONTHLY", now }),
      "pto-accrual:month:2026-08"
    );
    assert.equal(
      accrualPeriodKey({
        policy: "PER_PAY_PERIOD",
        now,
        payPeriodStart: new Date("2026-08-09T00:00:00.000Z"),
      }),
      "pto-accrual:period:2026-08-09"
    );
  });

  it("forfeits hours above the carryover cap", () => {
    assert.equal(carryoverHoursToForfeit(40, 20), 20);
    assert.equal(carryoverHoursToForfeit(10, 20), 0);
    assert.equal(carryoverHoursToForfeit(40, null), 0);
  });

  it("skips when the period was already granted", () => {
    const plan = planEmployeeAccrual({
      policy: "MONTHLY",
      annualHours: 80,
      payPeriodType: "MONTHLY",
      now: new Date("2026-08-15T08:15:00.000Z"),
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      currentBalance: 10,
      existingAccrualKeys: ["pto-accrual:month:2026-08"],
    });
    assert.equal(plan.action, "skip");
    if (plan.action === "skip") assert.equal(plan.reason, "already_granted");
  });

  it("does not double-grant this year's opening annual balance", () => {
    const plan = planEmployeeAccrual({
      policy: "ANNUAL_GRANT",
      annualHours: 80,
      payPeriodType: "BIWEEKLY",
      now: new Date("2026-08-15T08:15:00.000Z"),
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      currentBalance: 80,
      existingAccrualKeys: [],
    });
    assert.equal(plan.action, "skip");
    if (plan.action === "skip") assert.equal(plan.reason, "opening_balance_covers_period");
  });

  it("grants the next annual allotment after the opening year", () => {
    const plan = planEmployeeAccrual({
      policy: "ANNUAL_GRANT",
      annualHours: 80,
      payPeriodType: "BIWEEKLY",
      now: new Date("2026-08-15T08:15:00.000Z"),
      createdAt: new Date("2025-03-01T00:00:00.000Z"),
      currentBalance: 40,
      carryoverLimit: 20,
      existingAccrualKeys: ["pto-accrual:year:2025"],
    });
    assert.equal(plan.action, "grant");
    if (plan.action === "grant") {
      assert.equal(plan.hours, 80);
      assert.equal(plan.carryoverForfeit, 20);
      assert.equal(plan.periodKey, "pto-accrual:year:2026");
    }
  });

  it("grants recurring monthly hours after the hire month", () => {
    const plan = planEmployeeAccrual({
      policy: "MONTHLY",
      annualHours: 120,
      payPeriodType: "MONTHLY",
      now: new Date("2026-08-15T08:15:00.000Z"),
      createdAt: new Date("2026-07-10T00:00:00.000Z"),
      currentBalance: 10,
      existingAccrualKeys: ["pto-accrual:month:2026-07"],
    });
    assert.equal(plan.action, "grant");
    if (plan.action === "grant") {
      assert.equal(plan.hours, 10);
      assert.equal(plan.periodKey, "pto-accrual:month:2026-08");
      assert.equal(plan.carryoverForfeit, 0);
    }
  });

  it("records an opening grant for new employees", () => {
    const grant = openingPtoGrant({
      policy: "PER_PAY_PERIOD",
      annualHours: 80,
      payPeriodType: "BIWEEKLY",
      now: new Date("2026-08-15T08:15:00.000Z"),
      payPeriodStart: new Date("2026-08-09T00:00:00.000Z"),
    });
    assert.equal(grant.hours, 3.08);
    assert.equal(grant.periodKey, "pto-accrual:period:2026-08-09");
  });
});
