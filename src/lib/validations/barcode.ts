import { z } from "zod";

export const barcodeLookupQuerySchema = z.object({
  locationId: z.string().optional(),
  /** When true, skip external catalog (register / checkout). */
  localOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const inventoryScanSessionCreateSchema = z.object({
  locationId: z.string().min(1),
  mode: z.enum(["RECEIVE", "CYCLE_COUNT", "DAMAGED", "LOST"]),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const inventoryScanLineAddSchema = z.object({
  barcode: z.string().min(1).max(256),
  quantity: z.number().int().min(1).max(100_000).optional(),
  detectedFormat: z.string().optional(),
});

export const inventoryScanLineEditSchema = z.object({
  scannedQty: z.number().int().min(0).max(100_000),
});

export const inventoryScanApplySchema = z.object({
  idempotencyKey: z.string().min(8).max(128).optional(),
  /** When true, re-read stock and apply even if expected qty drifted. */
  acceptConflicts: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export const barcodeAssignSchema = z.object({
  barcode: z.string().min(1).max(256),
  productId: z.string().min(1),
  variantId: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export const externalSuggestionAcceptSchema = z.object({
  barcode: z.string().min(1).max(256),
  source: z.string().min(1),
  name: z.string().min(1).max(200),
  brand: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  packageSize: z.string().max(80).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  manufacturer: z.string().max(120).optional(),
  suggestedCategory: z.string().max(120).optional(),
  price: z.number().min(0),
  cost: z.number().min(0).optional(),
  categoryId: z.string().optional(),
  taxable: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  initialStock: z.number().int().min(0).optional(),
  locationId: z.string().optional(),
  reorderPoint: z.number().int().min(0).optional(),
});
