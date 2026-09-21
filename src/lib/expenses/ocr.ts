import { CATEGORY_KEYWORDS } from "./constants";

export type OcrLineItem = {
  description: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
};

export type OcrParseResult = {
  merchant?: string;
  address?: string;
  date?: string;
  time?: string;
  receiptNumber?: string;
  total?: number;
  tax?: number;
  tip?: number;
  amount?: number;
  cardLast4?: string;
  paymentHint?: "card" | "cash" | "other";
  items: OcrLineItem[];
  categorySuggestion?: string;
  currency?: string;
  confidence: number;
  rawText: string;
};

const DATE_RE =
  /\b(?:(\d{4})[/-](\d{1,2})[/-](\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{2,4}))\b/;
const CARD_RE = /(?:card|visa|mastercard|amex|discover|debit|ending|xxxx|\*{2,})\s*[:\-]?\s*(\d{4})\b/i;
const TIME_RE = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i;
const RECEIPT_NO_RE =
  /(?:receipt|invoice|trans(?:action)?|order|ticket)\s*(?:#|no\.?|number|:)?\s*#?\s*([A-Z0-9][A-Z0-9-]{2,})/i;
const ADDRESS_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pkwy|hwy)\b\.?/i;
const TOTAL_RE =
  /(?:^|\n)\s*(?:grand\s+)?total\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/im;
const TAX_RE = /(?:sales\s*)?tax\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i;
const TIP_RE = /(?:tip|gratuity)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i;
const SUBTOTAL_RE = /sub\s*-?\s*total\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i;

function parseMoney(value: string): number {
  return Number.parseFloat(value.replace(/,/g, ""));
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function extractDate(text: string): string | undefined {
  const match = text.match(DATE_RE);
  if (!match) return undefined;
  if (match[1] && match[2] && match[3]) {
    return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (match[4] && match[5] && match[6]) {
    let year = Number(match[6]);
    if (year < 100) year += 2000;
    // Prefer US MM/DD/YYYY
    return toIsoDate(year, Number(match[4]), Number(match[5]));
  }
  return undefined;
}

function looksLikeAddress(line: string): boolean {
  return ADDRESS_RE.test(line) || /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line);
}

function extractMerchant(lines: string[]): string | undefined {
  for (const line of lines.slice(0, 8)) {
    const cleaned = line.trim();
    if (!cleaned) continue;
    if (/^\d+$/.test(cleaned)) continue;
    if (DATE_RE.test(cleaned) && cleaned.length < 24) continue;
    if (looksLikeAddress(cleaned)) continue;
    if (/^(receipt|invoice|thank you|store\s*#)/i.test(cleaned)) continue;
    if (/\d+\.\d{2}/.test(cleaned) && cleaned.length < 12) continue;
    if (cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  }
  return undefined;
}

function extractAddress(lines: string[], merchant?: string): string | undefined {
  const parts: string[] = [];
  for (const line of lines.slice(0, 8)) {
    if (merchant && line.trim() === merchant) continue;
    if (looksLikeAddress(line) || /\b[A-Z]{2}\s+\d{5}\b/.test(line)) {
      parts.push(line.trim());
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(", ") : undefined;
}

function extractTime(text: string): string | undefined {
  const match = text.match(TIME_RE);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 23) return undefined;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractPaymentHint(text: string): "card" | "cash" | "other" | undefined {
  if (/\b(visa|mastercard|amex|american express|discover|debit|credit card)\b/i.test(text)) {
    return "card";
  }
  if (/\bcash\b/i.test(text)) return "cash";
  if (/\b(check|ach|bank transfer)\b/i.test(text)) return "other";
  return undefined;
}

function suggestCategory(merchant: string | undefined, text: string): string | undefined {
  const haystack = `${merchant ?? ""} ${text}`.toLowerCase();
  let best: { name: string; score: number } | undefined;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) score += keyword.length;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { name: category, score };
    }
  }
  return best?.name;
}

function extractLineItems(lines: string[]): OcrLineItem[] {
  const items: OcrLineItem[] = [];
  for (const line of lines) {
    if (/\b(grand\s+)?total\b|\btax\b|\btip\b|sub\s*-?\s*total|change|balance|receipt|visa|mastercard/i.test(line)) {
      continue;
    }
    const amounts = [...line.matchAll(/\$?\s*(\d+\.\d{2})\b/g)];
    if (amounts.length === 0) continue;
    const amount = parseMoney(amounts[amounts.length - 1]![1]!);
    const qtyMatch = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|×)\s+/i);
    const quantity = qtyMatch ? Number(qtyMatch[1]) : undefined;
    const unitPrice =
      quantity && amounts.length >= 2 ? parseMoney(amounts[0]![1]!) : undefined;
    const description = line
      .replace(/^(\d+(?:\.\d+)?)\s*(?:x|×)\s+/i, "")
      .replace(/\$?\s*\d+\.\d{2}/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (description.length < 2 || amount <= 0) continue;
    items.push({
      description,
      amount,
      ...(quantity && quantity > 0 ? { quantity } : {}),
      ...(unitPrice != null && unitPrice > 0 ? { unitPrice } : {}),
    });
    if (items.length >= 25) break;
  }
  return items;
}

/**
 * Heuristic OCR parser for receipt text.
 * Production integrations can plug a real OCR provider into `parseReceiptText`
 * while keeping the same result shape (merchant, date, totals, items, category).
 */
export function parseReceiptText(rawText: string, fileName?: string): OcrParseResult {
  const text = rawText.replace(/\r/g, "").trim();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const totalMatch = text.match(TOTAL_RE);
  const taxMatch = text.match(TAX_RE);
  const tipMatch = text.match(TIP_RE);
  const subtotalMatch = text.match(SUBTOTAL_RE);
  const cardMatch = text.match(CARD_RE);
  const receiptMatch = text.match(RECEIPT_NO_RE);

  const total = totalMatch ? parseMoney(totalMatch[1]!) : undefined;
  const tax = taxMatch ? parseMoney(taxMatch[1]!) : undefined;
  const tip = tipMatch ? parseMoney(tipMatch[1]!) : undefined;
  const amount =
    subtotalMatch != null
      ? parseMoney(subtotalMatch[1]!)
      : total != null
        ? Math.max(0, total - (tax ?? 0) - (tip ?? 0))
        : undefined;

  const merchant =
    extractMerchant(lines) ||
    (fileName
      ? fileName
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim()
      : undefined);

  const date = extractDate(text);
  const time = extractTime(text);
  const address = extractAddress(lines, merchant);
  const items = extractLineItems(lines);
  const categorySuggestion = suggestCategory(merchant, text);
  const paymentHint = extractPaymentHint(text);

  let confidence = 20;
  if (merchant) confidence += 15;
  if (date) confidence += 15;
  if (total != null) confidence += 25;
  if (tax != null) confidence += 10;
  if (cardMatch) confidence += 10;
  if (items.length > 0) confidence += 5;
  if (address) confidence += 4;
  if (receiptMatch) confidence += 4;
  confidence = Math.min(98, confidence);

  return {
    merchant,
    address,
    date,
    time,
    receiptNumber: receiptMatch?.[1],
    total,
    tax,
    tip,
    amount,
    cardLast4: cardMatch?.[1],
    paymentHint,
    items,
    categorySuggestion,
    currency: "USD",
    confidence,
    rawText: text,
  };
}

export function emptyOcrResult(rawText = ""): OcrParseResult {
  return {
    items: [],
    confidence: 0,
    rawText,
  };
}
