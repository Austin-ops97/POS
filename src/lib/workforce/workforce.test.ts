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
import {
  collectTimeEntryFlags,
  isLongShift,
  longShiftFlagLabel,
  validateTimesheetEditTimes,
} from "./timesheet-flags";

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

  it("includes paid breaks in overtime calculations when configured", () => {
    const monday = new Date("2026-07-06T14:00:00Z");
    const entries = [{
      clockIn: monday,
      clockOut: new Date(monday.getTime() + 41 * 60 * 60 * 1000),
      status: "COMPLETED" as const,
      breaks: [{
        breakStart: new Date(monday.getTime() + 10 * 60 * 60 * 1000),
        breakEnd: new Date(monday.getTime() + 11 * 60 * 60 * 1000),
      }],
    }];
    const result = computeWeeklyOvertimeHours(entries as never, 0, 40, true);
    assert.equal(result.regularHours, 40);
    assert.equal(result.overtimeHours, 1);
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

  it("includes accountant-facing period and leave columns", () => {
    const csv = payrollToCsv([], { start: "2026-08-01", end: "2026-08-14", payDate: "2026-08-20" });
    assert.match(csv, /Pay Period,Pay Date/);
    assert.match(csv, /PTO Hrs,Sick Hrs,Vacation Hrs,Holiday Hrs,Unpaid Hrs/);
  });
});

describe("timesheet long-shift flags", () => {
  it("flags open punches past 12 hours as forgot to clock out", () => {
    const clockIn = new Date("2026-08-24T08:00:00Z");
    const asOf = new Date("2026-08-24T21:00:00Z");
    assert.equal(isLongShift({ clockIn, status: "ACTIVE" }, asOf), true);
    const flag = longShiftFlagLabel({ clockIn, status: "ACTIVE" }, asOf);
    assert.ok(flag?.includes("Forgot to clock out"));
  });

  it("does not flag shifts under 12 hours", () => {
    const clockIn = new Date("2026-08-24T08:00:00Z");
    const clockOut = new Date("2026-08-24T16:00:00Z");
    assert.equal(isLongShift({ clockIn, clockOut, status: "COMPLETED" }, clockOut), false);
  });

  it("flags completed shifts longer than 12 hours", () => {
    const clockIn = new Date("2026-08-24T08:00:00Z");
    const clockOut = new Date("2026-08-24T21:30:00Z");
    assert.equal(isLongShift({ clockIn, clockOut, status: "COMPLETED" }, clockOut), true);
    const flags = collectTimeEntryFlags({ clockIn, clockOut, status: "COMPLETED", breaks: [] });
    assert.ok(flags.some((f) => f.includes("Long day")));
  });
});

describe("validateTimesheetEditTimes", () => {
  it("rejects clock out before clock in", () => {
    const start = new Date("2026-08-24T09:00:00Z");
    const end = new Date("2026-08-24T08:00:00Z");
    assert.ok(validateTimesheetEditTimes(start, end));
  });

  it("allows a normal edit window", () => {
    const start = new Date("2026-08-24T09:00:00Z");
    const end = new Date("2026-08-24T17:00:00Z");
    assert.equal(validateTimesheetEditTimes(start, end), null);
  });

  it("lets a manager correct a 20-hour forgotten clock-out", () => {
    const start = new Date("2026-08-24T08:00:00Z");
    const end = new Date("2026-08-25T04:00:00Z");
    assert.equal(
      validateTimesheetEditTimes(start, end, { allowOpen: false, maxHours: 72 }),
      null
    );
  });

  it("requires clock out when correcting an open shift", () => {
    const start = new Date("2026-08-24T08:00:00Z");
    assert.equal(
      validateTimesheetEditTimes(start, null, { allowOpen: false, maxHours: 72 }),
      "Clock out is required"
    );
  });
});
