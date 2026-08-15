import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adjustmentDelta,
  clampOnHand,
  parseQuantityInput,
} from "./inventory-quantity";

describe("adjustmentDelta", () => {
  it("sends damaged and lost counts as negative stock changes", () => {
    assert.equal(adjustmentDelta("DAMAGED", 3), -3);
    assert.equal(adjustmentDelta("LOST", 1), -1);
    assert.equal(adjustmentDelta("DAMAGED", -4), -4);
  });

  it("keeps receive, return, transfer, and manual counts positive", () => {
    assert.equal(adjustmentDelta("RECEIVED", 12), 12);
    assert.equal(adjustmentDelta("RETURN_TO_STOCK", 2), 2);
    assert.equal(adjustmentDelta("TRANSFER", 5), 5);
    assert.equal(adjustmentDelta("MANUAL_ADJUSTMENT", 8), 8);
  });

  it("rejects zero or non-integer units", () => {
    assert.equal(adjustmentDelta("RECEIVED", 0), 0);
    assert.equal(adjustmentDelta("DAMAGED", 1.5), 0);
  });
});

describe("clampOnHand", () => {
  it("floors and bounds on-hand values", () => {
    assert.equal(clampOnHand(12.9), 12);
    assert.equal(clampOnHand(-3), 0);
    assert.equal(clampOnHand(Number.NaN), 0);
  });
});

describe("parseQuantityInput", () => {
  it("parses whole numbers and treats empty as incomplete", () => {
    assert.equal(parseQuantityInput("24"), 24);
    assert.equal(parseQuantityInput(""), null);
    assert.equal(parseQuantityInput("  "), null);
    assert.equal(parseQuantityInput("1.5"), null);
    assert.equal(parseQuantityInput("-2"), null);
    assert.equal(parseQuantityInput("-2", { allowNegative: true }), -2);
  });
});
