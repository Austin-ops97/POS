import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeProposedDeltaForTest,
  movementTypeForModeForTest,
} from "./inventory-scan-test-helpers";

describe("inventory scan mode math", () => {
  it("receive adds scanned quantity", () => {
    assert.equal(computeProposedDeltaForTest("RECEIVE", 10, 3), 3);
  });

  it("cycle count sets delta to counted minus expected", () => {
    assert.equal(computeProposedDeltaForTest("CYCLE_COUNT", 10, 8), -2);
    assert.equal(computeProposedDeltaForTest("CYCLE_COUNT", 10, 12), 2);
  });

  it("damaged and lost decrease inventory", () => {
    assert.equal(computeProposedDeltaForTest("DAMAGED", 10, 2), -2);
    assert.equal(computeProposedDeltaForTest("LOST", 10, 1), -1);
  });

  it("maps modes to movement types", () => {
    assert.equal(movementTypeForModeForTest("RECEIVE"), "RECEIVED");
    assert.equal(movementTypeForModeForTest("CYCLE_COUNT"), "MANUAL_ADJUSTMENT");
    assert.equal(movementTypeForModeForTest("DAMAGED"), "DAMAGED");
    assert.equal(movementTypeForModeForTest("LOST"), "LOST");
  });
});
