import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  captureSubmitForm,
  reminderPayloadFromFormData,
  resetFormSafely,
  resetUsingEventCurrentTarget,
} from "./reminder-form";
import { reminderCreateSchema } from "@/lib/validations/reminders";

describe("project reminder form currentTarget handling", () => {
  it("reproduces the original currentTarget failure after the event is cleared", async () => {
    let target: { reset: () => void } | null = { reset() {} };
    const event = {
      preventDefault() {},
      get currentTarget() {
        return target;
      },
    };

    captureSubmitForm(event);
    await Promise.resolve();
    target = null;

    assert.throws(
      () => resetUsingEventCurrentTarget(event),
      (error: unknown) =>
        error instanceof TypeError &&
        /null is not an object \(evaluating 'e\.currentTarget\.reset'\)/.test(String(error.message))
    );
  });

  it("resets the captured form after a successful async save", async () => {
    let resetCount = 0;
    let target: { reset: () => void } | null = {
      reset() {
        resetCount += 1;
      },
    };
    const event = {
      preventDefault() {},
      get currentTarget() {
        return target;
      },
    };
    const form = captureSubmitForm(event);
    await Promise.resolve();
    target = null;
    resetFormSafely(form);
    assert.equal(resetCount, 1);
  });

  it("validates reminder fields before submit", () => {
    const missing = reminderPayloadFromFormData(new FormData());
    assert.deepEqual(missing, { error: "Title is required" });

    const form = new FormData();
    form.set("title", "Follow up");
    form.set("scheduledAt", "not-a-date");
    assert.deepEqual(reminderPayloadFromFormData(form), { error: "Choose a valid date and time" });

    const noRecipients = new FormData();
    noRecipients.set("title", "Follow up");
    noRecipients.set("scheduledAt", "2026-08-25T15:00");
    assert.deepEqual(reminderPayloadFromFormData(noRecipients), { error: "Choose at least one recipient" });
  });

  it("accepts a valid create payload and rejects missing recipients", () => {
    const ok = reminderCreateSchema.safeParse({
      title: "Check in",
      scheduledAt: "2026-08-25T16:00:00.000Z",
      timezone: "America/Chicago",
      recipients: { includeOwner: true, includeAdmins: false, employeeIds: [], emails: [] },
    });
    assert.equal(ok.success, true);
    const failed = reminderCreateSchema.safeParse({
      title: "Check in",
      scheduledAt: "2026-08-25T16:00:00.000Z",
      recipients: { includeOwner: false, includeAdmins: false, employeeIds: [], emails: [] },
    });
    assert.equal(failed.success, false);
  });

  it("builds a successful create payload with timezone and recurrence", () => {
    const form = new FormData();
    form.set("title", "Site visit");
    form.set("message", "Bring photos");
    form.set("scheduledAt", "2026-08-25T10:30");
    form.set("timezone", "America/Chicago");
    form.set("recurrence", "WEEKLY");
    form.set("intervalCount", "2");
    form.set("includeOwner", "on");
    const parsed = reminderPayloadFromFormData(form);
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.title, "Site visit");
    assert.equal(parsed.timezone, "America/Chicago");
    assert.equal(parsed.recurrence, "WEEKLY");
    assert.equal(parsed.recipients.includeOwner, true);
    assert.ok(parsed.scheduledAt.endsWith("Z") || parsed.scheduledAt.includes("T"));
  });
});
