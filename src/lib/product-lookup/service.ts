import { db } from "@/lib/db";
import type { NormalizedBarcode } from "@/lib/barcodes";
import {
  getProductLookupConfig,
  type ExternalProductSuggestion,
  type ProductCatalogProvider,
} from "./types";
import { OpenFactsProvider } from "./open-facts-provider";
import { sanitizeSuggestion } from "./types";

/** Simple process-local circuit breaker for external providers. */
const providerState = new Map<
  string,
  { failures: number; openUntil: number }
>();

const FAILURE_THRESHOLD = 5;
const BACKOFF_MS = 60_000;

function isCircuitOpen(name: string): boolean {
  const state = providerState.get(name);
  if (!state) return false;
  if (Date.now() < state.openUntil) return true;
  return false;
}

function recordSuccess(name: string) {
  providerState.set(name, { failures: 0, openUntil: 0 });
}

function recordFailure(name: string) {
  const prev = providerState.get(name) ?? { failures: 0, openUntil: 0 };
  const failures = prev.failures + 1;
  providerState.set(name, {
    failures,
    openUntil:
      failures >= FAILURE_THRESHOLD ? Date.now() + BACKOFF_MS : prev.openUntil,
  });
}

let providers: ProductCatalogProvider[] | null = null;

export function getCatalogProviders(): ProductCatalogProvider[] {
  if (!providers) {
    providers = [new OpenFactsProvider()];
  }
  return providers;
}

/** Test hook to inject providers. */
export function setCatalogProvidersForTests(
  next: ProductCatalogProvider[] | null
) {
  providers = next;
}

export async function lookupExternalProduct(
  barcode: NormalizedBarcode,
  signal?: AbortSignal
): Promise<ExternalProductSuggestion | null> {
  const config = getProductLookupConfig();
  if (!config.enabled) return null;
  if (barcode.skipExternalLookup) return null;

  const cacheKey = barcode.gtin14 || barcode.normalizedValue;
  if (!cacheKey) return null;

  const cached = await db.externalProductCache.findUnique({
    where: { normalizedBarcode: cacheKey },
  });

  if (cached && cached.expiresAt > new Date()) {
    await db.externalProductCache.update({
      where: { id: cached.id },
      data: {
        lastHitAt: new Date(),
        lookupCount: { increment: 1 },
      },
    });

    if (cached.isNegative) return null;

    return sanitizeSuggestion({
      normalizedBarcode: cached.normalizedBarcode,
      source: cached.source,
      sourceProductType: cached.productType,
      name: cached.name,
      brand: cached.brand,
      description: cached.description,
      packageSize: cached.packageSize,
      imageUrl: cached.imageUrl,
      manufacturer: cached.manufacturer,
      suggestedCategory: cached.categoryText,
      confidence:
        (cached.confidence ?? 0) >= 0.75
          ? "HIGH"
          : (cached.confidence ?? 0) >= 0.45
            ? "MEDIUM"
            : "LOW",
      imageAttribution: cached.imageUrl
        ? `${cached.source} (cached external catalog)`
        : null,
    });
  }

  for (const provider of getCatalogProviders()) {
    if (isCircuitOpen(provider.name)) {
      console.warn("[product-lookup] circuit open", { provider: provider.name });
      continue;
    }

    try {
      const result = await provider.lookupBarcode(barcode, signal);
      recordSuccess(provider.name);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + config.cacheDays);

      if (!result) {
        await upsertCache({
          normalizedBarcode: cacheKey,
          source: provider.name,
          isNegative: true,
          expiresAt,
        });
        continue;
      }

      await upsertCache({
        normalizedBarcode: cacheKey,
        source: result.suggestion.source,
        productType: result.suggestion.sourceProductType,
        name: result.suggestion.name,
        brand: result.suggestion.brand,
        description: result.suggestion.description,
        packageSize: result.suggestion.packageSize,
        imageUrl: result.suggestion.imageUrl,
        manufacturer: result.suggestion.manufacturer,
        categoryText: result.suggestion.suggestedCategory,
        rawPayload: result.rawPayload as object,
        confidence: result.confidenceScore,
        isNegative: false,
        expiresAt,
      });

      return result.suggestion;
    } catch (error) {
      recordFailure(provider.name);
      console.warn("[product-lookup] provider error", {
        provider: provider.name,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return null;
}

async function upsertCache(data: {
  normalizedBarcode: string;
  source: string;
  productType?: string | null;
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  packageSize?: string | null;
  imageUrl?: string | null;
  manufacturer?: string | null;
  categoryText?: string | null;
  rawPayload?: object | null;
  confidence?: number | null;
  isNegative: boolean;
  expiresAt: Date;
}) {
  await db.externalProductCache.upsert({
    where: { normalizedBarcode: data.normalizedBarcode },
    create: {
      normalizedBarcode: data.normalizedBarcode,
      source: data.source,
      productType: data.productType ?? null,
      name: data.name ?? null,
      brand: data.brand ?? null,
      description: data.description ?? null,
      packageSize: data.packageSize ?? null,
      imageUrl: data.imageUrl ?? null,
      manufacturer: data.manufacturer ?? null,
      categoryText: data.categoryText ?? null,
      rawPayload: data.rawPayload ?? undefined,
      confidence: data.confidence ?? null,
      isNegative: data.isNegative,
      expiresAt: data.expiresAt,
      lookupCount: 1,
      lastHitAt: new Date(),
    },
    update: {
      source: data.source,
      productType: data.productType ?? null,
      name: data.name ?? null,
      brand: data.brand ?? null,
      description: data.description ?? null,
      packageSize: data.packageSize ?? null,
      imageUrl: data.imageUrl ?? null,
      manufacturer: data.manufacturer ?? null,
      categoryText: data.categoryText ?? null,
      rawPayload: data.rawPayload ?? undefined,
      confidence: data.confidence ?? null,
      isNegative: data.isNegative,
      expiresAt: data.expiresAt,
      fetchedAt: new Date(),
      lastHitAt: new Date(),
      lookupCount: { increment: 1 },
    },
  });
}
