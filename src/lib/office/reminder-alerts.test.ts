import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zonedDateTimeToUtc } from "./reminder-schedule";
import {
  deliverRecipientAlert,
  MAX_EMAIL_ATTEMPTS,
  planRecipientChannels,
  reminderRecipientDedupeKey,
  shouldAdvanceSchedule,
  shouldRetryEmail,
} from "./reminder-alerts";

describe("reminder alert channels", () => {
  it("sends in-app and email for an enabled employee", () => {
    const plan = planRecipientChannels({
      employeeId: "emp_1",
      email: "alex@example.com",
      name: "Alex",
      emailRemindersEnabled: true,
      inAppRemindersEnabled: true,
    });
    assert.equal(plan.sendEmail, true);
    assert.equal(plan.sendInApp, true);
  });

  it("skips email when the recipient has no address or disabled email alerts", () => {
    assert.equal(
      planRecipientChannels({
        employeeId: "emp_1",
        email: null,
        name: "Alex",
        emailRemindersEnabled: true,
        inAppRemindersEnabled: true,
      }).emailSkipReason,
      "no_email"
    );
    assert.equal(
      planRecipientChannels({
        employeeId: "emp_1",
        email: "alex@example.com",
        name: "Alex",
        emailRemindersEnabled: false,
        inAppRemindersEnabled: true,
      }).emailSkipReason,
      "email_disabled"
    );
  });

  it("skips in-app for external emails and disabled in-app preferences", () => {
    assert.equal(
      planRecipientChannels({
        employeeId: null,
        email: "client@example.com",
        name: null,
        emailRemindersEnabled: true,
        inAppRemindersEnabled: true,
      }).inAppSkipReason,
      "external_recipient"
    );
    assert.equal(
      planRecipientChannels({
        employeeId: "emp_1",
        email: "alex@example.com",
        name: "Alex",
        emailRemindersEnabled: true,
        inAppRemindersEnabled: false,
      }).inAppSkipReason,
      "in_app_disabled"
    );
  });

  it("prevents duplicate alerts for the same occurrence", async () => {
    let emails = 0;
    let inApp = 0;
    const recipient = {
      employeeId: "emp_1",
      email: "alex@example.com",
      name: "Alex",
      emailRemindersEnabled: true,
      inAppRemindersEnabled: true,
    };
    const first = await deliverRecipientAlert({
      recipient,
      existing: null,
      sendEmail: async () => {
        emails += 1;
        return { messageId: "msg_1" };
      },
      notifyInApp: async () => {
        inApp += 1;
      },
    });
    assert.equal(first.skippedDuplicate, false);
    assert.equal(first.emailStatus, "SENT");
    assert.equal(first.inAppStatus, "SENT");

    const second = await deliverRecipientAlert({
      recipient,
      existing: { id: "del_1", status: "SENT", inAppStatus: "SENT", attemptCount: 1 },
      sendEmail: async () => {
        emails += 1;
        return { messageId: "msg_2" };
      },
      notifyInApp: async () => {
        inApp += 1;
      },
    });
    assert.equal(second.skippedDuplicate, true);
    assert.equal(emails, 1);
    assert.equal(inApp, 1);
    assert.equal(reminderRecipientDedupeKey(recipient), "employee:emp_1");
  });

  it("retries failed email delivery until the attempt cap", async () => {
    assert.equal(shouldRetryEmail("FAILED", 1), true);
    assert.equal(shouldRetryEmail("FAILED", MAX_EMAIL_ATTEMPTS), false);
    assert.equal(shouldRetryEmail("SENT", 1), false);

    let attempts = 0;
    const result = await deliverRecipientAlert({
      recipient: {
        employeeId: "emp_1",
        email: "alex@example.com",
        name: "Alex",
        emailRemindersEnabled: true,
        inAppRemindersEnabled: false,
      },
      existing: { id: "del_1", status: "FAILED", inAppStatus: "SKIPPED", attemptCount: 1 },
      sendEmail: async () => {
        attempts += 1;
        throw new Error("provider_down");
      },
      notifyInApp: async () => {
        throw new Error("should not notify");
      },
    });
    assert.equal(result.retrying, true);
    assert.equal(result.emailStatus, "FAILED");
    assert.equal(attempts, 1);
    assert.equal(shouldAdvanceSchedule({ failedEmail: true, retryableFailure: true }), false);
    assert.equal(shouldAdvanceSchedule({ failedEmail: true, retryableFailure: false }), true);
  });

  it("records a failed email without creating a duplicate in-app notification", async () => {
    let inApp = 0;
    const result = await deliverRecipientAlert({
      recipient: {
        employeeId: "emp_1",
        email: "alex@example.com",
        name: "Alex",
        emailRemindersEnabled: true,
        inAppRemindersEnabled: true,
      },
      existing: { id: "del_1", status: "FAILED", inAppStatus: "SENT", attemptCount: 1 },
      sendEmail: async () => {
        throw new Error("bounce");
      },
      notifyInApp: async () => {
        inApp += 1;
      },
    });
    assert.equal(result.emailStatus, "FAILED");
    assert.equal(result.inAppStatus, "SENT");
    assert.equal(inApp, 0);
  });

  it("uses timezone wall-clock instants for due handling", () => {
    const chicagoMorning = zonedDateTimeToUtc(2026, 8, 25, 9, 0, 0, "America/Chicago");
    const utcMorning = zonedDateTimeToUtc(2026, 8, 25, 9, 0, 0, "UTC");
    assert.notEqual(chicagoMorning.toISOString(), utcMorning.toISOString());
    assert.equal(chicagoMorning <= new Date("2026-08-25T14:00:00.000Z"), true);
    assert.equal(chicagoMorning <= new Date("2026-08-25T13:59:00.000Z"), false);
  });
});
