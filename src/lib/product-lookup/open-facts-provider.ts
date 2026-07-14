import type {
  NormalizedBarcode,
} from "@/lib/barcodes";
import {
  getProductLookupConfig,
  sanitizeSuggestion,
  type ExternalProductResult,
  type ProductCatalogProvider,
} from "./types";

type OpenFactsProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  quantity?: string;
  image_url?: string;
  image_front_url?: string;
  categories?: string;
  manufacturing_places?: string;
  generic_name?: string;
  product_type?: string;
};

type OpenFactsResponse = {
  status?: number;
  status_verbose?: string;
  product?: OpenFactsProduct;
  code?: string;
};

/**
 * Open Facts universal product lookup (food, beauty, pet food, general products).
 * Server-side only. Uses product_type=all when supported.
 */
export class OpenFactsProvider implements ProductCatalogProvider {
  name = "open_facts";

  async lookupBarcode(
    barcode: NormalizedBarcode,
    signal?: AbortSignal
  ): Promise<ExternalProductResult | null> {
    const config = getProductLookupConfig();
    if (!config.enabled) return null;
    if (barcode.skipExternalLookup || !barcode.gtin14) return null;

    // Prefer EAN-13 / UPC without GTIN-14 padding for Open Facts
    const code =
      barcode.gtin14.replace(/^0+/, "").length >= 8
        ? barcode.gtin14.slice(-13).replace(/^0(?=\d{12}$)/, "") ||
          barcode.gtin14.slice(1)
        : barcode.normalizedValue;

    // Try GTIN without leading zeros of GTIN-14, then EAN-13, then UPC-A
    const attempts = uniqueCodes([
      barcode.gtin14.replace(/^0+/, "") || barcode.gtin14,
      barcode.gtin14.slice(1),
      barcode.gtin14.slice(2),
      code,
    ]);

    for (const attempt of attempts) {
      const result = await this.fetchProduct(attempt, signal);
      if (result) return result;
    }
    return null;
  }

  private async fetchProduct(
    code: string,
    signal?: AbortSignal
  ): Promise<ExternalProductResult | null> {
    const config = getProductLookupConfig();
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_en,brands,quantity,image_url,image_front_url,categories,manufacturing_places,generic_name,product_type&product_type=all`;

    let lastError: unknown;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.requestTimeoutMs
      );
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": config.userAgent,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (res.status === 404) return null;
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`Open Facts HTTP ${res.status}`);
          await sleep(200 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          console.warn("[product-lookup] open_facts non-ok", {
            status: res.status,
            code,
          });
          return null;
        }

        const data = (await res.json()) as OpenFactsResponse;
        if (data.status !== 1 || !data.product) return null;

        const p = data.product;
        const name =
          p.product_name?.trim() ||
          p.product_name_en?.trim() ||
          p.generic_name?.trim() ||
          null;
        if (!name) return null;

        const imageUrl = p.image_front_url || p.image_url || null;
        const suggestion = sanitizeSuggestion({
          normalizedBarcode: code,
          source: "open_facts",
          sourceProductType: p.product_type || null,
          name,
          brand: p.brands || null,
          description: p.generic_name || null,
          packageSize: p.quantity || null,
          imageUrl,
          manufacturer: p.manufacturing_places || null,
          suggestedCategory: p.categories?.split(",")[0]?.trim() || null,
          imageAttribution: imageUrl
            ? "Image from Open Food Facts / Open Products Facts (see provider license)"
            : null,
        });

        return {
          suggestion,
          rawPayload: data.product,
          confidenceScore:
            suggestion.confidence === "HIGH"
              ? 0.9
              : suggestion.confidence === "MEDIUM"
                ? 0.6
                : 0.3,
        };
      } catch (error) {
        lastError = error;
        if (signal?.aborted) return null;
        await sleep(200 * (attempt + 1));
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    }

    console.warn("[product-lookup] open_facts failed after retries", {
      code,
      error: lastError instanceof Error ? lastError.message : lastError,
    });
    return null;
  }
}

function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of codes) {
    const t = c.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
