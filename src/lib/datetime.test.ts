import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDate,
  isValidTimezone,
  resolveDisplayTimezone,
  DEFAULT_DISPLAY_TIMEZONE,
} from "./datetime";
import type { AuthContext } from "./auth";

function makeCtx(displayTimezone: string): AuthContext {
  return {
    displayTimezone,
    clerkId: "clerk",
    userId: "user",
    email: "test@example.com",
    isPlatformAdmin: false,
    employee: {} as AuthContext["employee"],
    business: {} as AuthContext["business"],
    location: null,
  };
}

describe("datetime", () => {
  it("formats dates in a specific timezone", () => {
    const utc = "2026-06-01T12:00:00.000Z";
    const eastern = formatDate(utc, { timeZone: "America/New_York" });
    const pacific = formatDate(utc, { timeZone: "America/Los_Angeles" });
    assert.notEqual(eastern, pacific);
    assert.match(eastern, /Jun/);
  });

  it("validates IANA timezones", () => {
    assert.equal(isValidTimezone("America/New_York"), true);
    assert.equal(isValidTimezone("Not/A_Timezone"), false);
  });

  it("resolves display timezone from auth context", () => {
    assert.equal(
      resolveDisplayTimezone(makeCtx("America/Chicago")),
      "America/Chicago"
    );
    assert.equal(
      resolveDisplayTimezone(makeCtx(DEFAULT_DISPLAY_TIMEZONE)),
      DEFAULT_DISPLAY_TIMEZONE
    );
  });
});
