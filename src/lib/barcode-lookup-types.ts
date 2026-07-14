import type { NormalizedBarcode } from "@/lib/barcodes";
import type { ExternalProductSuggestion } from "@/lib/product-lookup/types";

export type ProductSummary = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  price: number;
  cost: number | null;
  taxable: boolean;
  trackInventory: boolean;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export type VariantSummary = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
};

export type InventorySummary = {
  id: string;
  locationId: string;
  quantityOnHand: number;
  quantityReserved: number;
  reorderPoint: number;
};

export type BarcodeLookupResponse =
  | {
      status: "LOCAL_MATCH";
      barcode: NormalizedBarcode;
      product: ProductSummary;
      variant: VariantSummary | null;
      inventory: InventorySummary | null;
    }
  | {
      status: "EXTERNAL_MATCH";
      barcode: NormalizedBarcode;
      externalProduct: ExternalProductSuggestion;
    }
  | {
      status: "NOT_FOUND";
      barcode: NormalizedBarcode;
    };
