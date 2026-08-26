import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  captureSubmitForm,
  describeReminderRecipients,
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
    assert.equal(parsed.recipients.includeAllEmployees, false);
    assert.ok(parsed.scheduledAt.endsWith("Z") || parsed.scheduledAt.includes("T"));
  });

  it("accepts all employees, all customers, or specific emails", () => {
    const employees = new FormData();
    employees.set("title", "Staff check-in");
    employees.set("scheduledAt", "2026-08-25T10:30");
    employees.set("includeAllEmployees", "on");
    const employeePayload = reminderPayloadFromFormData(employees);
    assert.ok(!("error" in employeePayload));
    if ("error" in employeePayload) return;
    assert.equal(employeePayload.recipients.includeAllEmployees, true);

    const customers = new FormData();
    customers.set("title", "Client update");
    customers.set("scheduledAt", "2026-08-25T10:30");
    customers.set("includeAllCustomers", "on");
    const customerPayload = reminderPayloadFromFormData(customers);
    assert.ok(!("error" in customerPayload));
    if ("error" in customerPayload) return;
    assert.equal(customerPayload.recipients.includeAllCustomers, true);

    const emails = new FormData();
    emails.set("title", "Vendor ping");
    emails.set("scheduledAt", "2026-08-25T10:30");
    emails.set("emails", "ops@example.com, owner@example.com");
    emails.set("projectId", "proj_1");
    const emailPayload = reminderPayloadFromFormData(emails);
    assert.ok(!("error" in emailPayload));
    if ("error" in emailPayload) return;
    assert.deepEqual(emailPayload.recipients.emails, ["ops@example.com", "owner@example.com"]);
    assert.equal(emailPayload.projectId, "proj_1");
    assert.equal(
      describeReminderRecipients(emailPayload.recipients),
      "2 emails"
    );
  });

  it("accepts audience flags on the create schema", () => {
    const allStaff = reminderCreateSchema.safeParse({
      title: "Check in",
      scheduledAt: "2026-08-25T16:00:00.000Z",
      recipients: { includeAllEmployees: true },
    });
    assert.equal(allStaff.success, true);
    const allCustomers = reminderCreateSchema.safeParse({
      title: "Check in",
      scheduledAt: "2026-08-25T16:00:00.000Z",
      recipients: { includeAllCustomers: true },
    });
    assert.equal(allCustomers.success, true);
  });
});
