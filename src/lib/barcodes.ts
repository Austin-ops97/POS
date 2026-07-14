/**
 * Shared barcode normalization and validation for NexaPOS.
 * Decoding happens on-device; only decoded values reach the server.
 */

export type BarcodeFormat =
  | "UPC_A"
  | "UPC_E"
  | "EAN_8"
  | "EAN_13"
  | "GTIN_14"
  | "CODE_128"
  | "CODE_39"
  | "ITF"
  | "GS1_DATAMATRIX"
  | "GS1_DIGITAL_LINK"
  | "QR_CODE"
  | "PLU"
  | "INTERNAL"
  | "VARIABLE_MEASURE"
  | "OTHER";

export type NormalizedBarcode = {
  rawValue: string;
  normalizedValue: string;
  gtin14: string | null;
  format: BarcodeFormat;
  isValidCheckDigit: boolean | null;
  /** True when external catalog lookup should be skipped by default. */
  skipExternalLookup: boolean;
};

const GS1_DIGITAL_LINK_HOSTS = [
  "id.gs1.org",
  "www.gs1.org",
  "dal.gs1.org",
];

/** GS1 Mod-10 check digit for GTIN strings of length 7–17 (excluding check digit). */
export function computeGtinCheckDigit(bodyWithoutCheck: string): number {
  const digits = bodyWithoutCheck.replace(/\D/g, "");
  let sum = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const digit = Number(digits[len - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function validateGtinCheckDigit(gtin: string): boolean {
  const digits = gtin.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return false;
  const body = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  return computeGtinCheckDigit(body) === check;
}

/** Expand UPC-E (6 or 8 digits with number system + check) to UPC-A (12 digits). */
export function expandUpcE(upcE: string): string | null {
  const d = upcE.replace(/\D/g, "");
  let numberSystem = "0";
  let core: string;
  let check: string | null = null;

  if (d.length === 6) {
    core = d;
  } else if (d.length === 7) {
    numberSystem = d[0]!;
    core = d.slice(1);
  } else if (d.length === 8) {
    numberSystem = d[0]!;
    core = d.slice(1, 7);
    check = d[7]!;
  } else {
    return null;
  }

  if (!/^\d{6}$/.test(core)) return null;

  const mfr = core.slice(0, 5);
  const last = core[5]!;
  let manufacturer: string;
  let product: string;

  switch (last) {
    case "0":
    case "1":
    case "2":
      manufacturer = mfr.slice(0, 2) + last + "00";
      product = "00" + mfr.slice(2, 5);
      break;
    case "3":
      manufacturer = mfr.slice(0, 3) + "00";
      product = "000" + mfr.slice(3, 5);
      break;
    case "4":
      manufacturer = mfr.slice(0, 4) + "0";
      product = "0000" + mfr.slice(4, 5);
      break;
    default:
      manufacturer = mfr;
      product = "0000" + last;
      break;
  }

  const upcA11 = numberSystem + manufacturer + product;
  if (upcA11.length !== 11) return null;
  const computedCheck = String(computeGtinCheckDigit(upcA11));
  if (check !== null && check !== computedCheck) return null;
  return upcA11 + computedCheck;
}

function toGtin14(digits: string): string {
  return digits.padStart(14, "0");
}

/** Strip spaces and common formatting; keep alphanumeric payload characters. */
export function stripBarcodeFormatting(raw: string): string {
  return raw
    .trim()
    .replace(/[\s\u00A0]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * Extract GTIN from a GS1 Digital Link URL when present.
 * Examples: https://id.gs1.org/01/09506000134352
 */
export function extractGtinFromGs1DigitalLink(value: string): string | null {
  const cleaned = stripBarcodeFormatting(value);
  let url: URL;
  try {
    url = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isGs1Host =
    GS1_DIGITAL_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ||
    host.includes("gs1");

  // Path style: /01/{gtin} or /gtin/{gtin}
  const pathMatch = url.pathname.match(
    /\/(?:01|gtin)\/(\d{8,14})(?:\/|$)/i
  );
  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  // Query: ?01= or ?gtin=
  const q01 = url.searchParams.get("01") || url.searchParams.get("gtin");
  if (q01 && /^\d{8,14}$/.test(q01)) {
    return q01;
  }

  // AI (01) embedded in path segments for non-GS1 hosts only if clearly structured
  if (isGs1Host || /\/01\//.test(url.pathname)) {
    const loose = url.pathname.match(/01\/(\d{8,14})/);
    if (loose?.[1]) return loose[1];
  }

  return null;
}

/**
 * US/retail variable-measure UPCs often start with 2.
 * Store-internal codes and short PLUs are also non-global.
 */
export function isVariableMeasureOrInternal(
  digits: string,
  format: BarcodeFormat
): boolean {
  if (format === "VARIABLE_MEASURE" || format === "INTERNAL" || format === "PLU") {
    return true;
  }
  if (/^\d{12}$/.test(digits) && digits.startsWith("2")) {
    return true;
  }
  if (/^\d{13}$/.test(digits) && (digits.startsWith("02") || digits.startsWith("2"))) {
    // EAN-13 with NS=2 variable measure conventions
    if (digits[0] === "2" || digits.startsWith("02")) return true;
  }
  // Short numeric PLUs (typically 4–5 digits)
  if (/^\d{4,5}$/.test(digits)) return true;
  return false;
}

function classifyNumeric(digits: string): {
  format: BarcodeFormat;
  gtin14: string | null;
  isValidCheckDigit: boolean | null;
  canonical: string;
} {
  const len = digits.length;

  if (len === 14) {
    const valid = validateGtinCheckDigit(digits);
    return {
      format: "GTIN_14",
      gtin14: valid ? digits : null,
      isValidCheckDigit: valid,
      canonical: valid ? digits : digits,
    };
  }

  if (len === 13) {
    const valid = validateGtinCheckDigit(digits);
    // UPC-A stored as EAN-13 with leading 0
    const format: BarcodeFormat =
      digits.startsWith("0") && validateGtinCheckDigit(digits.slice(1))
        ? "EAN_13"
        : "EAN_13";
    return {
      format,
      gtin14: valid ? toGtin14(digits) : null,
      isValidCheckDigit: valid,
      canonical: valid ? toGtin14(digits) : digits,
    };
  }

  if (len === 12) {
    const valid = validateGtinCheckDigit(digits);
    return {
      format: "UPC_A",
      gtin14: valid ? toGtin14(digits) : null,
      isValidCheckDigit: valid,
      canonical: valid ? toGtin14(digits) : digits,
    };
  }

  if (len === 8) {
    // Could be EAN-8 or UPC-E with NS+check
    const asEan8 = validateGtinCheckDigit(digits);
    if (asEan8) {
      return {
        format: "EAN_8",
        gtin14: toGtin14(digits),
        isValidCheckDigit: true,
        canonical: toGtin14(digits),
      };
    }
    const expanded = expandUpcE(digits);
    if (expanded && validateGtinCheckDigit(expanded)) {
      return {
        format: "UPC_E",
        gtin14: toGtin14(expanded),
        isValidCheckDigit: true,
        canonical: toGtin14(expanded),
      };
    }
    return {
      format: "OTHER",
      gtin14: null,
      isValidCheckDigit: false,
      canonical: digits,
    };
  }

  if (len === 6 || len === 7) {
    const expanded = expandUpcE(digits);
    if (expanded && validateGtinCheckDigit(expanded)) {
      return {
        format: "UPC_E",
        gtin14: toGtin14(expanded),
        isValidCheckDigit: true,
        canonical: toGtin14(expanded),
      };
    }
  }

  if (len >= 4 && len <= 5) {
    return {
      format: "PLU",
      gtin14: null,
      isValidCheckDigit: null,
      canonical: digits,
    };
  }

  return {
    format: "OTHER",
    gtin14: null,
    isValidCheckDigit: null,
    canonical: digits,
  };
}

export type NormalizeBarcodeOptions = {
  /** Hint from the scanner (e.g. "ean_13", "code_128"). */
  detectedFormat?: string | null;
};

/**
 * Normalize a scanned or typed barcode for exact matching.
 * Equivalent UPC-A and EAN-13 (leading zero) forms share the same canonical GTIN-14.
 */
export function normalizeBarcode(
  rawInput: string,
  options: NormalizeBarcodeOptions = {}
): NormalizedBarcode {
  const rawValue = rawInput;
  const cleaned = stripBarcodeFormatting(rawInput);

  if (!cleaned || cleaned.length > 256) {
    return {
      rawValue,
      normalizedValue: "",
      gtin14: null,
      format: "OTHER",
      isValidCheckDigit: null,
      skipExternalLookup: true,
    };
  }

  // GS1 Digital Link
  const gtinFromLink = extractGtinFromGs1DigitalLink(cleaned);
  if (gtinFromLink) {
    const classified = classifyNumeric(gtinFromLink);
    return {
      rawValue,
      normalizedValue: classified.canonical,
      gtin14: classified.gtin14,
      format: "GS1_DIGITAL_LINK",
      isValidCheckDigit: classified.isValidCheckDigit,
      skipExternalLookup: !classified.gtin14,
    };
  }

  const hint = (options.detectedFormat || "").toLowerCase().replace(/[- ]/g, "_");

  // Pure digits → GTIN family
  if (/^\d+$/.test(cleaned)) {
    const classified = classifyNumeric(cleaned);
    let format = classified.format;

    if (hint.includes("upc_e") || hint.includes("upce")) format = "UPC_E";
    if (hint.includes("itf") || hint.includes("interleaved")) format = "ITF";
    if (hint.includes("data_matrix") || hint.includes("datamatrix")) {
      format = "GS1_DATAMATRIX";
    }

    const variable = isVariableMeasureOrInternal(cleaned, format);
    if (variable && format !== "UPC_E" && format !== "EAN_8") {
      format =
        /^\d{4,5}$/.test(cleaned)
          ? "PLU"
          : cleaned.startsWith("2") || cleaned.startsWith("02")
            ? "VARIABLE_MEASURE"
            : format === "OTHER"
              ? "INTERNAL"
              : format;
    }

    return {
      rawValue,
      normalizedValue: classified.canonical,
      gtin14: classified.gtin14,
      format,
      isValidCheckDigit: classified.isValidCheckDigit,
      skipExternalLookup:
        variable ||
        classified.isValidCheckDigit === false ||
        !classified.gtin14,
    };
  }

  // Alphanumeric / Code 128 / Code 39 / QR text
  let format: BarcodeFormat = "OTHER";
  if (hint.includes("code_128") || hint.includes("code128")) format = "CODE_128";
  else if (hint.includes("code_39") || hint.includes("code39")) format = "CODE_39";
  else if (hint.includes("qr")) format = "QR_CODE";
  else if (hint.includes("data_matrix") || hint.includes("datamatrix")) {
    format = "GS1_DATAMATRIX";
  } else if (/^[A-Z0-9\-\.\/\+\s]+$/i.test(cleaned) && cleaned.length <= 48) {
    format = "CODE_128";
  }

  const upper = cleaned.toUpperCase();
  return {
    rawValue,
    normalizedValue: upper,
    gtin14: null,
    format,
    isValidCheckDigit: null,
    skipExternalLookup: true,
  };
}

/** Reject empty / obviously invalid scan payloads before lookup. */
export function isUsableBarcode(barcode: NormalizedBarcode): boolean {
  if (!barcode.normalizedValue) return false;
  if (barcode.normalizedValue.length < 1) return false;
  if (
    barcode.isValidCheckDigit === false &&
    barcode.gtin14 === null &&
    /^\d{8,14}$/.test(barcode.normalizedValue)
  ) {
    // Invalid GTIN check digit — still allow local assignment of raw merchant codes
    // but mark as usable for local match of the normalized/raw cleaned form
  }
  return true;
}

/**
 * Candidate keys to try for exact DB match (canonical first, then common aliases).
 */
export function barcodeMatchCandidates(barcode: NormalizedBarcode): string[] {
  const set = new Set<string>();
  if (barcode.normalizedValue) set.add(barcode.normalizedValue);
  if (barcode.gtin14) {
    set.add(barcode.gtin14);
    // EAN-13 (trim one leading zero from GTIN-14)
    const ean13 = barcode.gtin14.slice(1);
    set.add(ean13);
    // UPC-A
    if (ean13.startsWith("0")) set.add(ean13.slice(1));
  }
  const cleaned = stripBarcodeFormatting(barcode.rawValue);
  if (cleaned) {
    set.add(cleaned);
    set.add(cleaned.toUpperCase());
  }
  return [...set];
}

export function sanitizeExternalText(
  value: string | null | undefined,
  maxLen = 500
): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
