import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashInvitationToken,
  invitationEmailMatches,
  safeAppRedirect,
} from "./employee-invitations";

describe("employee invitations", () => {
  it("hashes tokens stably", () => {
    assert.equal(hashInvitationToken("abc"), hashInvitationToken("abc"));
    assert.notEqual(hashInvitationToken("abc"), hashInvitationToken("abd"));
  });

  it("matches invitation email against any of the signed-in addresses", () => {
    assert.equal(
      invitationEmailMatches("Scott@Shop.com", ["other@x.com", "scott@shop.com"]),
      true
    );
    assert.equal(invitationEmailMatches("scott@shop.com", ["someone.else@shop.com"]), false);
  });

  it("accepts only in-app redirect paths", () => {
    assert.equal(safeAppRedirect("/join/token"), "/join/token");
    assert.equal(safeAppRedirect("https://evil.example/phish"), null);
    assert.equal(safeAppRedirect("//evil.example"), null);
    assert.equal(safeAppRedirect("/\\evil"), null);
  });
});
