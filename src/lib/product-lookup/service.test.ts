import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRateLimit, resetRateLimits } from "../rate-limit";
import { sanitizeSuggestion, scoreConfidence } from "./types";

describe("rate limit", () => {
  it("allows until limit then blocks", () => {
    resetRateLimits();
    assert.equal(checkRateLimit("t1", 2, 60_000).ok, true);
    assert.equal(checkRateLimit("t1", 2, 60_000).ok, true);
    const blocked = checkRateLimit("t1", 2, 60_000);
    assert.equal(blocked.ok, false);
  });
});

describe("external suggestion sanitization", () => {
  it("scores confidence and sanitizes text", () => {
    const scored = scoreConfidence({
      name: "Widget",
      brand: "Acme",
      imageUrl: "https://example.com/a.png",
      packageSize: "12 oz",
    });
    assert.equal(scored.level, "HIGH");

    const suggestion = sanitizeSuggestion({
      normalizedBarcode: "00036000291452",
      source: "open_facts",
      sourceProductType: "food",
      name: "  Widget\u0000  ",
      brand: "Acme",
      description: null,
      packageSize: "12 oz",
      imageUrl: "javascript:alert(1)",
      manufacturer: null,
      suggestedCategory: "Snacks",
      imageAttribution: null,
    });
    assert.equal(suggestion.name, "Widget");
    assert.equal(suggestion.imageUrl, null);
  });
});
