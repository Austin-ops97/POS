import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError } from "zod";
import {
  TERMINATABLE_STATUSES,
  assertTerminationAuthorized,
  isTerminatableStatus,
  canTerminateOrder,
  normalizeTerminationInput,
  resolveTerminationState,
  shouldSetInventoryRestoredAt,
  TerminationGateError,
} from "./terminate-order-helpers";
import { PERMISSIONS } from "@/lib/permissions";

describe("isTerminatableStatus / canTerminateOrder", () => {
  it("allows draft, held, pending payment, and failed", () => {
    for (const status of ["DRAFT", "HELD", "PENDING_PAYMENT", "FAILED"]) {
      assert.equal(isTerminatableStatus(status), true);
      assert.equal(canTerminateOrder(status), true);
      assert.ok(TERMINATABLE_STATUSES.has(status as never));
    }
  });

  it("rejects paid, refunded, and canceled statuses", () => {
    for (const status of [
      "PAID",
      "PARTIALLY_REFUNDED",
      "REFUNDED",
      "CANCELED",
    ]) {
      assert.equal(isTerminatableStatus(status), false);
      assert.equal(canTerminateOrder(status), false);
    }
  });
});

describe("assertTerminationAuthorized", () => {
  it("throws when terminate permission is missing", () => {
    assert.throws(
      () =>
        assertTerminationAuthorized({
          hasTerminatePermission: false,
          moduleEnabled: true,
          settingsEnabled: true,
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.message === `Missing permission: ${PERMISSIONS.TERMINATE_ORDER}`
    );
  });

  it("throws when ORDER_TERMINATION module is disabled", () => {
    assert.throws(
      () =>
        assertTerminationAuthorized({
          hasTerminatePermission: true,
          moduleEnabled: false,
          settingsEnabled: true,
        }),
      (err: unknown) =>
        err instanceof Error && err.message === "Module disabled: ORDER_TERMINATION"
    );
  });

  it("throws when business settings disable termination", () => {
    assert.throws(
      () =>
        assertTerminationAuthorized({
          hasTerminatePermission: true,
          moduleEnabled: true,
          settingsEnabled: false,
        }),
      (err: unknown) =>
        err instanceof TerminationGateError &&
        err.statusCode === 403 &&
        /disabled for this business/i.test(err.message)
    );
  });

  it("passes when permission, module, and settings allow", () => {
    assert.doesNotThrow(() =>
      assertTerminationAuthorized({
        hasTerminatePermission: true,
        moduleEnabled: true,
        settingsEnabled: true,
      })
    );
  });
});

describe("resolveTerminationState", () => {
  it("returns idempotent for already terminated canceled orders", () => {
    assert.equal(
      resolveTerminationState({
        status: "CANCELED",
        terminatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      "idempotent"
    );
  });

  it("returns proceed for terminatable statuses", () => {
    assert.equal(
      resolveTerminationState({ status: "HELD", terminatedAt: null }),
      "proceed"
    );
    assert.equal(
      resolveTerminationState({
        status: "PENDING_PAYMENT",
        terminatedAt: null,
      }),
      "proceed"
    );
  });

  it("rejects invalid statuses such as PAID", () => {
    assert.throws(
      () => resolveTerminationState({ status: "PAID", terminatedAt: null }),
      (err: unknown) =>
        err instanceof TerminationGateError &&
        err.statusCode === 400 &&
        /Cannot terminate order with status: PAID/.test(err.message)
    );
  });

  it("rejects CANCELED without terminatedAt as invalid (not a prior termination)", () => {
    assert.throws(
      () => resolveTerminationState({ status: "CANCELED", terminatedAt: null }),
      TerminationGateError
    );
  });
});

describe("normalizeTerminationInput", () => {
  it("trims notes and accepts predefined reasons", () => {
    assert.deepEqual(
      normalizeTerminationInput({
        reason: "DUPLICATE_ORDER",
        notes: "  duplicate ticket  ",
      }),
      { reason: "DUPLICATE_ORDER", notes: "duplicate ticket" }
    );
  });

  it("requires notes when reason is OTHER", () => {
    assert.throws(
      () => normalizeTerminationInput({ reason: "OTHER", notes: "   " }),
      ZodError
    );
    assert.throws(
      () => normalizeTerminationInput({ reason: "OTHER" }),
      ZodError
    );
  });

  it("accepts OTHER with notes", () => {
    assert.deepEqual(
      normalizeTerminationInput({ reason: "OTHER", notes: "manual void" }),
      { reason: "OTHER", notes: "manual void" }
    );
  });
});

describe("shouldSetInventoryRestoredAt", () => {
  it("marks restore when inventoryRestoredAt is unset (no-op restore for held)", () => {
    assert.equal(shouldSetInventoryRestoredAt(null), true);
    assert.equal(shouldSetInventoryRestoredAt(undefined), true);
  });

  it("is idempotent when inventoryRestoredAt is already set", () => {
    assert.equal(
      shouldSetInventoryRestoredAt(new Date("2026-02-01T12:00:00Z")),
      false
    );
  });
});
