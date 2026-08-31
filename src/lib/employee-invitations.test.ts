import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashInvitationToken,
  invitationEmailMatches,
  safeAppRedirect,
} from "./employee-invitations";
import { employeeInviteFormSchema } from "./validations";

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

describe("employee invite form schema", () => {
  it("accepts name, email, role, and a blank optional PIN", () => {
    const parsed = employeeInviteFormSchema.parse({
      name: "Scott",
      email: "scott@shop.com",
      roleId: "role_cashier",
      pin: "",
      locationIds: [],
    });
    assert.equal(parsed.name, "Scott");
    assert.equal(parsed.email, "scott@shop.com");
    assert.equal(parsed.pin, "");
  });

  it("rejects a missing role instead of silently blocking send", () => {
    const result = employeeInviteFormSchema.safeParse({
      name: "Scott",
      email: "scott@shop.com",
      roleId: "",
      pin: "",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0]?.message ?? "", /role/i);
    }
  });

  it("rejects a partial PIN", () => {
    const result = employeeInviteFormSchema.safeParse({
      name: "Scott",
      email: "scott@shop.com",
      roleId: "role_cashier",
      pin: "12",
    });
    assert.equal(result.success, false);
  });
});
