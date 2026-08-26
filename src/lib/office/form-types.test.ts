import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  finalizedFormOptions,
  isFormMetadata,
  isFormResponseMetadata,
  publicFormPath,
} from "@/lib/office/form-types";

describe("Office form types", () => {
  it("builds public form paths", () => {
    assert.equal(publicFormPath("clx123"), "/forms/clx123");
  });

  it("finalizes dropdown options", () => {
    assert.deepEqual(finalizedFormOptions([" Small ", "Medium", "", "Large "]), ["Small", "Medium", "Large"]);
  });

  it("detects form and response metadata", () => {
    assert.equal(isFormMetadata({ kind: "form", description: "", fields: [] }), true);
    assert.equal(isFormMetadata({ kind: "response", formId: "x", formTitle: "x", answers: {} }), false);
    assert.equal(isFormResponseMetadata({ kind: "response", formId: "x", formTitle: "x", answers: {} }), true);
  });
});
