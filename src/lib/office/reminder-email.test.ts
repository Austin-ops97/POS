import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReminderTimestamp,
  reminderEmailSubject,
  reminderGreetingName,
  reminderTemplateVariables,
  renderReminderEmail,
  REMINDER_TEMPLATE_VARIABLE_KEYS,
} from "./reminder-email";

describe("reminderGreetingName", () => {
  it("uses the first name when the profile has a real name", () => {
    assert.equal(reminderGreetingName("Austin Alexander", "aus.l.alexander@icloud.com"), "Austin");
  });

  it("does not greet with an email address", () => {
    assert.equal(reminderGreetingName("aus.l.alexander@icloud.com", "aus.l.alexander@icloud.com"), null);
  });
});

describe("reminderEmailSubject", () => {
  it("uses a work-style subject instead of a bracketed campaign tag", () => {
    assert.equal(
      reminderEmailSubject({ title: "Test", projectTitle: "POS System", isTest: true }),
      "POS System: Test (test)"
    );
    assert.equal(
      reminderEmailSubject({ title: "Follow up", projectTitle: "POS System" }),
      "POS System: Follow up"
    );
  });
});

describe("renderReminderEmail", () => {
  it("fills the Resend system-alert template variables", () => {
    const now = new Date("2026-08-26T15:00:00.000Z");
    const email = renderReminderEmail({
      recipientName: "Austin Alexander",
      title: "Follow up",
      message: "Check the board.",
      projectTitle: "POS System",
      businessName: "Sqyid",
      projectUrl: "https://www.emeraldvalestudios.online/office/apps/projects",
      occurredAt: now,
      timezone: "UTC",
      referenceId: "rem_123",
      now,
    });
    assert.equal(email.subject, "POS System: Follow up");
    assert.equal(email.variables.headline, "Follow up");
    assert.equal(email.variables.alert_title, "Follow up");
    assert.equal(email.variables.alert_summary, "Check the board.");
    assert.equal(email.variables.alert_type, "Reminder");
    assert.equal(email.variables.status_label, "Scheduled reminder");
    assert.equal(email.variables.system_name, "Project reminders");
    assert.equal(email.variables.reference_id, "rem_123");
    assert.equal(email.variables.action_label, "Open project");
    assert.equal(email.variables.action_url, "https://www.emeraldvalestudios.online/office/apps/projects");
    assert.match(email.variables.intro, /Hi Austin/);
    assert.equal(email.variables.severity_class, "");
    for (const key of REMINDER_TEMPLATE_VARIABLE_KEYS) {
      assert.equal(typeof email.variables[key], "string");
    }
    assert.match(email.html, /Open project/);
    assert.match(email.html, /Emerald Vale/);
    assert.match(email.html, /Check the board\./);
    assert.doesNotMatch(email.subject, /\[Test\]|\[Reminder\]/);
    assert.doesNotMatch(email.html, /unsubscribe|PROMOTION|newsletter/i);
  });

  it("marks test sends in the template eyebrow and status", () => {
    const email = reminderTemplateVariables({
      title: "Follow up",
      message: "Check the board.",
      projectTitle: "POS System",
      businessName: "Sqyid",
      projectUrl: "https://example.com/projects",
      isTest: true,
      now: new Date("2026-08-26T15:00:00.000Z"),
      timezone: "UTC",
    });
    assert.equal(email.alert_type, "Test reminder");
    assert.equal(email.status_label, "Test send");
    assert.match(email.subject, /\(test\)$/);
  });
});

describe("formatReminderTimestamp", () => {
  it("formats an instant in the reminder timezone", () => {
    const stamp = formatReminderTimestamp(new Date("2026-08-26T15:00:00.000Z"), "UTC");
    assert.match(stamp, /Aug 26, 2026/);
    assert.match(stamp, /3:00/);
  });
});
