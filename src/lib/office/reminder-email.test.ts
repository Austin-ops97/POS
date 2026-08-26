import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reminderEmailSubject, reminderGreetingName, renderReminderEmail } from "./reminder-email";

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
  it("renders a transactional body without promo phrasing", () => {
    const email = renderReminderEmail({
      recipientName: "Austin Alexander",
      title: "Follow up",
      message: "Check the board.",
      projectTitle: "POS System",
      businessName: "Sqyid",
      projectUrl: "https://www.emeraldvalestudios.online/office/apps/projects",
    });
    assert.match(email.text, /^Hi Austin,/);
    assert.match(email.html, /Open this project/);
    assert.doesNotMatch(email.subject, /\[Test\]|\[Reminder\]/);
    assert.equal(email.variables.PROJECT, "POS System");
    assert.equal(email.variables.GREETING, "Hi Austin,");
    assert.doesNotMatch(email.html, /unsubscribe|PROMOTION|newsletter/i);
  });
});
