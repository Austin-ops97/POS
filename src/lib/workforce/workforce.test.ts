import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getInitialWeekStart,
  getWeekRange,
  shiftWeekStart,
} from "./schedule-week";
import { validateShiftTimes } from "./schedule-service";
import { buildShiftInstants } from "./timezone";
import { resolveDisplayName, buildLegalName } from "./employee-service";
import { computeWeeklyOvertimeHours } from "./payroll-service";
import { payrollToCsv } from "./payroll-service";

describe("schedule-week", () => {
  it("returns stable ISO range for the same week start", () => {
    const weekStart = getInitialWeekStart(0, new Date("2026-07-06T12:00:00Z"));
    const a = getWeekRange(weekStart);
    const b = getWeekRange(weekStart);
    assert.equal(a.fromIso, b.fromIso);
    assert.equal(a.toIso, b.toIso);
    assert.equal(a.weekDays.length, 7);
  });

  it("shifts week by seven days", () => {
    const weekStart = getInitialWeekStart(0, new Date("2026-07-06T12:00:00Z"));
    const next = shiftWeekStart(weekStart, 1);
    assert.equal(next.getTime() - weekStart.getTime(), 7 * 24 * 60 * 60 * 1000);
  });
});

describe("validateShiftTimes", () => {
  it("rejects end before start", () => {
    const start = new Date("2026-07-10T09:00:00Z");
    const end = new Date("2026-07-10T08:00:00Z");
    assert.ok(validateShiftTimes(start, end));
  });

  it("allows valid shift", () => {
    const start = new Date("2026-07-10T09:00:00Z");
    const end = new Date("2026-07-10T17:00:00Z");
    assert.equal(validateShiftTimes(start, end), null);
  });

  it("rejects shifts longer than 24 hours", () => {
    const start = new Date("2026-07-10T09:00:00Z");
    const end = new Date("2026-07-11T10:00:00Z");
    assert.ok(validateShiftTimes(start, end));
  });
});

describe("buildShiftInstants", () => {
  it("handles overnight shifts", () => {
    const { startAt, endAt, isOvernight } = buildShiftInstants({
      date: "2026-07-10",
      startTime: "22:00",
      endTime: "06:00",
      timezone: "America/New_York",
      overnight: true,
    });
    assert.equal(isOvernight, true);
    assert.ok(endAt > startAt);
  });
});

describe("resolveDisplayName", () => {
  it("uses preferred name when strategy is PREFERRED", () => {
    const name = resolveDisplayName({
      name: "Legacy",
      legalFirstName: "Jane",
      legalMiddleName: null,
      legalLastName: "Doe",
      preferredName: "JD",
      displayNameStrategy: "PREFERRED",
    });
    assert.equal(name, "JD");
  });

  it("builds legal name", () => {
    assert.equal(
      buildLegalName({ legalFirstName: "Jane", legalMiddleName: "Q", legalLastName: "Doe" }),
      "Jane Q Doe"
    );
  });
});

describe("computeWeeklyOvertimeHours", () => {
  it("calculates overtime per workweek", () => {
    const monday = new Date("2026-07-06T14:00:00Z");
    const tuesday = new Date("2026-07-07T14:00:00Z");
    const entries = [
      {
        clockIn: monday,
        clockOut: new Date(monday.getTime() + 10 * 60 * 60 * 1000),
        status: "COMPLETED" as const,
        breaks: [],
      },
      {
        clockIn: tuesday,
        clockOut: new Date(tuesday.getTime() + 10 * 60 * 60 * 1000),
        status: "COMPLETED" as const,
        breaks: [],
      },
    ];
    const result = computeWeeklyOvertimeHours(entries as never, 0, 40);
    assert.equal(result.regularHours, 20);
    assert.equal(result.overtimeHours, 0);
  });

  it("applies overtime above weekly threshold", () => {
    const monday = new Date("2026-07-06T14:00:00Z");
    const entries = [
      {
        clockIn: monday,
        clockOut: new Date(monday.getTime() + 45 * 60 * 60 * 1000),
        status: "COMPLETED" as const,
        breaks: [],
      },
    ];
    const result = computeWeeklyOvertimeHours(entries as never, 0, 40);
    assert.equal(result.regularHours, 40);
    assert.equal(result.overtimeHours, 5);
  });
});

describe("payrollToCsv", () => {
  it("escapes commas and quotes in employee names", () => {
    const csv = payrollToCsv([
      {
        employeeId: "1",
        employeeName: 'Smith, "Ace"',
        payType: "HOURLY",
        hourlyWage: 20,
        scheduledHours: 40,
        actualHours: 40,
        breakHours: 0,
        regularHours: 40,
        overtimeHours: 0,
        regularPay: 800,
        overtimePay: 0,
        bonusTotal: 0,
        totalPay: 800,
        flags: ["Schedule variance, note"],
      },
    ]);
    assert.ok(csv.includes('"Smith, ""Ace"""'));
    assert.ok(csv.includes('"Schedule variance, note"'));
  });
});
