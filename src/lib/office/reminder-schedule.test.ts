import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceReminderSchedule,
  applySendBefore,
  computeNextSendAt,
  getZonedParts,
  occurrenceKey,
  zonedDateTimeToUtc,
} from "./reminder-schedule";

describe("reminder schedule", () => {
  it("returns null for ONE_TIME next send", () => {
    const from = new Date("2026-08-01T15:00:00.000Z");
    assert.equal(computeNextSendAt("ONE_TIME", from, 1, "America/Chicago"), null);
  });

  it("advances daily by intervalCount in timezone", () => {
    const from = zonedDateTimeToUtc(2026, 8, 1, 9, 30, 0, "America/Chicago");
    const next = computeNextSendAt("DAILY", from, 2, "America/Chicago");
    assert.ok(next);
    const parts = getZonedParts(next!, "America/Chicago");
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 8);
    assert.equal(parts.day, 3);
    assert.equal(parts.hour, 9);
    assert.equal(parts.minute, 30);
  });

  it("advances weekly and monthly without collapsing occurrence keys", () => {
    const from = zonedDateTimeToUtc(2026, 1, 31, 10, 0, 0, "America/Chicago");
    const weekly = computeNextSendAt("WEEKLY", from, 1, "America/Chicago");
    const monthly = computeNextSendAt("MONTHLY", from, 1, "America/Chicago");
    assert.ok(weekly);
    assert.ok(monthly);
    assert.notEqual(occurrenceKey(from), occurrenceKey(weekly!));
    assert.notEqual(occurrenceKey(from), occurrenceKey(monthly!));
    assert.notEqual(occurrenceKey(weekly!), occurrenceKey(monthly!));

    const monthParts = getZonedParts(monthly!, "America/Chicago");
    assert.equal(monthParts.month, 2);
    assert.equal(monthParts.day, 28);
  });

  it("applySendBefore subtracts minutes", () => {
    const scheduled = new Date("2026-08-01T16:00:00.000Z");
    const sendAt = applySendBefore(scheduled, 30);
    assert.equal(sendAt.toISOString(), "2026-08-01T15:30:00.000Z");
  });

  it("advanceReminderSchedule stops at maxOccurrences and stopAt", () => {
    const occurrenceAt = zonedDateTimeToUtc(2026, 8, 1, 8, 0, 0, "UTC");
    assert.equal(
      advanceReminderSchedule({
        recurrence: "DAILY",
        occurrenceAt,
        intervalCount: 1,
        timezone: "UTC",
        occurrenceCount: 2,
        maxOccurrences: 3,
      }),
      null
    );

    const stopAt = zonedDateTimeToUtc(2026, 8, 1, 12, 0, 0, "UTC");
    assert.equal(
      advanceReminderSchedule({
        recurrence: "DAILY",
        occurrenceAt,
        intervalCount: 1,
        timezone: "UTC",
        occurrenceCount: 0,
        stopAt,
      }),
      null
    );

    const next = advanceReminderSchedule({
      recurrence: "DAILY",
      occurrenceAt,
      intervalCount: 1,
      timezone: "UTC",
      occurrenceCount: 0,
    });
    assert.ok(next);
    assert.notEqual(occurrenceKey(occurrenceAt), occurrenceKey(next!));
  });
});
