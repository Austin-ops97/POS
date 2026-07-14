import type { NormalizedBarcode } from "@/lib/barcodes";
import {
  isSafeImageUrl,
  sanitizeExternalText,
} from "@/lib/barcodes";

export type ExternalProductConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ExternalProductSuggestion = {
  normalizedBarcode: string;
  source: string;
  sourceProductType: string | null;
  name: string | null;
  brand: string | null;
  description: string | null;
  packageSize: string | null;
  imageUrl: string | null;
  manufacturer: string | null;
  suggestedCategory: string | null;
  confidence: ExternalProductConfidence;
  imageAttribution: string | null;
};

export type ExternalProductResult = {
  suggestion: ExternalProductSuggestion;
  rawPayload: unknown;
  confidenceScore: number;
};

export interface ProductCatalogProvider {
  name: string;
  lookupBarcode(
    barcode: NormalizedBarcode,
    signal?: AbortSignal
  ): Promise<ExternalProductResult | null>;
}

export type ProductLookupConfig = {
  enabled: boolean;
  userAgent: string;
  cacheDays: number;
  requestTimeoutMs: number;
  maxRetries: number;
};

export function getProductLookupConfig(): ProductLookupConfig {
  const enabled =
    (process.env.PRODUCT_LOOKUP_ENABLED ?? "true").toLowerCase() !== "false";
  const userAgent =
    process.env.PRODUCT_LOOKUP_USER_AGENT?.trim() ||
    "NexaPOS/0.1.0 (configure PRODUCT_LOOKUP_USER_AGENT)";
  const cacheDays = Math.max(
    1,
    Number.parseInt(process.env.PRODUCT_LOOKUP_CACHE_DAYS || "30", 10) || 30
  );
  return {
    enabled,
    userAgent,
    cacheDays,
    requestTimeoutMs: 8_000,
    maxRetries: 2,
  };
}

export function scoreConfidence(input: {
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  packageSize: string | null;
}): { level: ExternalProductConfidence; score: number } {
  let score = 0;
  if (input.name) score += 0.45;
  if (input.brand) score += 0.2;
  if (input.imageUrl) score += 0.2;
  if (input.packageSize) score += 0.15;
  const level: ExternalProductConfidence =
    score >= 0.75 ? "HIGH" : score >= 0.45 ? "MEDIUM" : "LOW";
  return { level, score };
}

export function sanitizeSuggestion(
  partial: Omit<ExternalProductSuggestion, "confidence"> & {
    confidence?: ExternalProductConfidence;
  }
): ExternalProductSuggestion {
  const name = sanitizeExternalText(partial.name, 200);
  const brand = sanitizeExternalText(partial.brand, 120);
  const description = sanitizeExternalText(partial.description, 1000);
  const packageSize = sanitizeExternalText(partial.packageSize, 80);
  const manufacturer = sanitizeExternalText(partial.manufacturer, 120);
  const suggestedCategory = sanitizeExternalText(partial.suggestedCategory, 120);
  const imageUrl = isSafeImageUrl(partial.imageUrl) ? partial.imageUrl! : null;
  const { level } = scoreConfidence({ name, brand, imageUrl, packageSize });

  return {
    normalizedBarcode: partial.normalizedBarcode,
    source: sanitizeExternalText(partial.source, 80) || "unknown",
    sourceProductType: sanitizeExternalText(partial.sourceProductType, 80),
    name,
    brand,
    description,
    packageSize,
    imageUrl,
    manufacturer,
    suggestedCategory,
    confidence: partial.confidence ?? level,
    imageAttribution:
      sanitizeExternalText(partial.imageAttribution, 200) ||
      (imageUrl ? `${partial.source} (external catalog)` : null),
  };
}
