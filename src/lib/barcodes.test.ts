import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeGtinCheckDigit,
  expandUpcE,
  extractGtinFromGs1DigitalLink,
  normalizeBarcode,
  validateGtinCheckDigit,
  barcodeMatchCandidates,
} from "./barcodes";

describe("GTIN check digits", () => {
  it("validates UPC-A check digit", () => {
    // Coca-Cola classic UPC example pattern — use known valid: 036000291452
    assert.equal(validateGtinCheckDigit("036000291452"), true);
    assert.equal(validateGtinCheckDigit("036000291453"), false);
  });

  it("validates EAN-13 check digit", () => {
    assert.equal(validateGtinCheckDigit("4006381333931"), true);
    assert.equal(validateGtinCheckDigit("4006381333932"), false);
  });

  it("validates EAN-8 check digit", () => {
    assert.equal(validateGtinCheckDigit("96385074"), true);
    assert.equal(validateGtinCheckDigit("96385075"), false);
  });

  it("computes check digit", () => {
    assert.equal(computeGtinCheckDigit("03600029145"), 2);
  });
});

describe("UPC-A / EAN-13 equivalence", () => {
  it("maps UPC-A and leading-zero EAN-13 to the same GTIN-14", () => {
    const upc = normalizeBarcode("036000291452");
    const ean = normalizeBarcode("0036000291452");
    assert.equal(upc.gtin14, ean.gtin14);
    assert.equal(upc.normalizedValue, ean.normalizedValue);
    assert.equal(upc.format, "UPC_A");
    assert.equal(ean.format, "EAN_13");
  });

  it("preserves leading zeroes via format-aware normalization", () => {
    const upc = normalizeBarcode("036000291452");
    assert.equal(upc.gtin14, "00036000291452");
    assert.ok(upc.normalizedValue.startsWith("0"));
  });

  it("includes alias candidates for matching", () => {
    const upc = normalizeBarcode("036000291452");
    const candidates = barcodeMatchCandidates(upc);
    assert.ok(candidates.includes("00036000291452"));
    assert.ok(candidates.includes("0036000291452"));
    assert.ok(candidates.includes("036000291452"));
  });
});

describe("UPC-E expansion", () => {
  it("expands UPC-E safely when supported", () => {
    const expanded = expandUpcE("01234565");
    assert.ok(expanded);
    assert.equal(expanded!.length, 12);
    assert.equal(validateGtinCheckDigit(expanded!), true);
  });
});

describe("invalid barcode rejection", () => {
  it("marks empty as unusable", () => {
    const empty = normalizeBarcode("   ");
    assert.equal(empty.normalizedValue, "");
    assert.equal(empty.skipExternalLookup, true);
  });

  it("flags invalid GTIN check digits for external skip", () => {
    const bad = normalizeBarcode("036000291453");
    assert.equal(bad.isValidCheckDigit, false);
    assert.equal(bad.skipExternalLookup, true);
  });
});

describe("GS1 Digital Link extraction", () => {
  it("extracts GTIN from id.gs1.org path", () => {
    const gtin = extractGtinFromGs1DigitalLink(
      "https://id.gs1.org/01/09506000134352"
    );
    assert.equal(gtin, "09506000134352");
  });

  it("normalizes digital link to GTIN canonical", () => {
    const result = normalizeBarcode("https://id.gs1.org/01/04006381333931");
    assert.equal(result.format, "GS1_DIGITAL_LINK");
    assert.ok(result.gtin14);
  });
});

describe("internal and variable-weight barcodes", () => {
  it("preserves internal Code 128 values", () => {
    const result = normalizeBarcode("STORE-SKU-99", {
      detectedFormat: "code_128",
    });
    assert.equal(result.format, "CODE_128");
    assert.equal(result.normalizedValue, "STORE-SKU-99");
    assert.equal(result.skipExternalLookup, true);
  });

  it("does not interpret variable-weight UPCs", () => {
    // Variable-measure style UPC starting with 2 — preserve, skip external
    const raw = "212345678901"; // may fail check digit; still preserved
    const result = normalizeBarcode(raw);
    assert.equal(result.skipExternalLookup, true);
    assert.ok(
      result.format === "VARIABLE_MEASURE" ||
        result.format === "UPC_A" ||
        result.format === "OTHER" ||
        result.format === "INTERNAL"
    );
    // Must not strip or reinterpret embedded price/weight into a different product key
    assert.ok(result.rawValue === raw || result.normalizedValue.includes("2"));
  });

  it("treats short PLU as internal", () => {
    const plu = normalizeBarcode("4011");
    assert.equal(plu.format, "PLU");
    assert.equal(plu.skipExternalLookup, true);
    assert.equal(plu.normalizedValue, "4011");
  });
});
