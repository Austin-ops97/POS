import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { celebrationSentence, monthDayLabel, upcomingCelebrations } from "./hr-dates";
import { buildVCard } from "./vcard";
import { computeOvertime } from "./overtime";
import { shiftAvailabilityIssue } from "./availability";
import { suggestSchedule } from "./schedule-suggestions";

const rules = {
  weekStartDay: 0,
  weeklyThresholdHours: 40,
  overtimeMultiplier: 1.5,
  dailyOvertimeThresholdHours: null,
  doubleTimeDailyThresholdHours: null,
  doubleTimeMultiplier: 2,
  exempt: false,
};

describe("hr dates", () => {
  it("shows month and day without a birth year", () => {
    const label = monthDayLabel(new Date(Date.UTC(1990, 7, 21)));
    assert.equal(label, "August 21");
    assert.equal(label.includes("1990"), false);
  });

  it("describes a work anniversary without requiring the hire year", () => {
    const [item] = upcomingCelebrations(
      [{ id: "1", name: "Sarah", hireDate: new Date(Date.UTC(2019, 7, 21)) }],
      new Date(Date.UTC(2026, 7, 20)),
      14
    );
    assert.equal(item?.kind, "anniversary");
    assert.equal(celebrationSentence(item!), "Sarah's work anniversary is August 21");
  });
});

describe("vCard", () => {
  it("includes work contact fields and leaves out pay and birth date", () => {
    const card = buildVCard({
      name: "Sarah Chen",
      jobTitle: "Lead",
      department: "Floor",
      email: "sarah@example.com",
      phone: "555-0100",
      organization: "Emerald Vale",
    });
    assert.match(card, /FN:Sarah Chen/);
    assert.match(card, /TITLE:Lead/);
    assert.match(card, /EMAIL;TYPE=WORK:sarah@example.com/);
    assert.equal(card.includes("BDAY"), false);
    assert.equal(card.includes("20.00"), false);
  });
});

describe("overtime rules", () => {
  it("keeps weekly overtime when no daily rule is set", () => {
    const monday = new Date("2026-07-06T14:00:00Z");
    const result = computeOvertime([{ at: monday, hours: 45 }], rules, 20);
    assert.equal(result.regularHours, 40);
    assert.equal(result.overtimeHours, 5);
    assert.equal(result.totalHours, 45);
    assert.equal(result.regularPay, 800);
    assert.equal(result.overtimePay, 150);
    assert.equal(result.grossPay, 950);
  });

  it("applies daily overtime before the weekly threshold", () => {
    const monday = new Date("2026-07-06T14:00:00Z");
    const result = computeOvertime([{ at: monday, hours: 10 }], { ...rules, dailyOvertimeThresholdHours: 8 }, 10);
    assert.equal(result.regularHours, 8);
    assert.equal(result.overtimeHours, 2);
    assert.equal(result.overtimePay, 30);
  });

  it("pays double time above the daily double-time threshold", () => {
    const monday = new Date("2026-07-06T14:00:00Z");
    const result = computeOvertime(
      [{ at: monday, hours: 14 }],
      { ...rules, dailyOvertimeThresholdHours: 8, doubleTimeDailyThresholdHours: 12 },
      10
    );
    assert.equal(result.regularHours, 8);
    assert.equal(result.overtimeHours, 4);
    assert.equal(result.doubleTimeHours, 2);
    assert.equal(result.doubleTimePay, 40);
  });

  it("exempts an employee from overtime", () => {
    const monday = new Date("2026-07-06T14:00:00Z");
    const result = computeOvertime([{ at: monday, hours: 50 }], { ...rules, exempt: true, dailyOvertimeThresholdHours: 8 }, 15);
    assert.equal(result.regularHours, 50);
    assert.equal(result.overtimeHours, 0);
    assert.equal(result.doubleTimeHours, 0);
    assert.equal(result.grossPay, 750);
  });
});

describe("availability constraints", () => {
  const windows = [{ weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 }];

  it("rejects a shift on an unavailable day once availability is saved", () => {
    const reason = shiftAvailabilityIssue({
      startAt: new Date("2026-07-07T15:00:00Z"),
      endAt: new Date("2026-07-07T20:00:00Z"),
      timeZone: "UTC",
      windows,
      exceptions: [],
      timeOff: [],
    });
    assert.match(reason ?? "", /unavailable/);
  });

  it("allows a shift inside the weekly window", () => {
    const reason = shiftAvailabilityIssue({
      startAt: new Date("2026-07-06T15:00:00Z"),
      endAt: new Date("2026-07-06T17:00:00Z"),
      timeZone: "UTC",
      windows,
      exceptions: [],
      timeOff: [],
    });
    assert.equal(reason, null);
  });

  it("rejects approved time off even when the day is normally available", () => {
    const reason = shiftAvailabilityIssue({
      startAt: new Date("2026-07-06T15:00:00Z"),
      endAt: new Date("2026-07-06T20:00:00Z"),
      timeZone: "UTC",
      windows,
      exceptions: [],
      timeOff: [{ startDate: "2026-07-06", endDate: "2026-07-06" }],
    });
    assert.match(reason ?? "", /time off/);
  });

  it("lets a temporary exception close one date", () => {
    const reason = shiftAvailabilityIssue({
      startAt: new Date("2026-07-06T15:00:00Z"),
      endAt: new Date("2026-07-06T20:00:00Z"),
      timeZone: "UTC",
      windows,
      exceptions: [{ date: "2026-07-06", available: false, startMinute: null, endMinute: null }],
      timeOff: [],
    });
    assert.match(reason ?? "", /unavailable/);
  });
});

describe("schedule suggestions", () => {
  it("does not assign someone who is off, and reports cost and overtime", () => {
    const start = new Date("2026-07-06T15:00:00Z");
    const end = new Date("2026-07-06T21:00:00Z");
    const employee = {
      id: "ada",
      name: "Ada",
      roleName: "Cashier",
      hourlyRate: 20,
      salaried: false,
      exempt: false,
      weeklyThresholdHours: 40,
      overtimeMultiplier: 1.5,
      windows: [{ weekday: 1, startMinute: 8 * 60, endMinute: 22 * 60 }],
      exceptions: [],
      timeOff: [],
      existingShifts: [],
      projectTitles: [],
      weekHours: 38,
    };
    const result = suggestSchedule({
      timeZone: "UTC",
      laborCostAlertAmount: 100,
      slots: [
        { id: "open", startAt: start, endAt: end, headcount: 1, requiredRole: "Manager" },
        { id: "pto", startAt: start, endAt: end, headcount: 1 },
      ],
      employees: [
        employee,
        { ...employee, id: "off", name: "Off", timeOff: [{ startDate: "2026-07-06", endDate: "2026-07-06" }] },
      ],
    });
    assert.equal(result.assignments.every((row) => row.employeeId !== "off"), true);
    assert.ok(result.assignments.some((row) => row.warnings.some((warning) => warning.code === "QUALIFICATION" || warning.code === "OVERTIME")));
    assert.equal(result.laborCostAlert, true);
    assert.ok(result.estimatedLaborCost > 0);
  });
});
