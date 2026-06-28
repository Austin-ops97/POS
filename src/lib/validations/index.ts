import { z } from "zod";

export const businessProfileSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  type: z.enum(["RETAIL", "SERVICE", "RENTAL", "RESTAURANT", "HYBRID"]),
  legalName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  primaryColor: z.string().optional(),
});

export const locationSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  taxRegion: z.string().optional(),
});

export const posConfigSchema = z.object({
  sellPhysical: z.boolean().optional(),
  sellServices: z.boolean().optional(),
  rentItems: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  acceptCash: z.boolean().optional(),
  barcodeScanning: z.boolean().optional(),
  receiptPrinting: z.boolean().optional(),
  employeePinLogin: z.boolean().optional(),
  multipleLocations: z.boolean().optional(),
});

export const taxRateSchema = z.object({
  name: z.string().min(1, "Tax name is required"),
  rate: z.number().min(0).max(1),
  locationId: z.string().optional(),
  appliesToProducts: z.boolean().optional(),
  appliesToServices: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const receiptSettingsSchema = z.object({
  receiptFooter: z.string().optional(),
  showCashierOnReceipt: z.boolean(),
  showCustomerOnReceipt: z.boolean(),
  showSkuOnReceipt: z.boolean(),
  enableReceiptPrinting: z.boolean(),
});

export const MODULE_SETTING_KEYS = [
  "RETAIL",
  "SERVICE",
  "RENTAL",
  "RESTAURANT",
  "LOYALTY",
  "GIFT_CARDS",
] as const;

export const moduleSettingsSchema = z
  .object({
    modules: z.array(
      z.object({
        module: z.enum(MODULE_SETTING_KEYS),
        enabled: z.boolean(),
      })
    ),
  })
  .superRefine((data, ctx) => {
    const retail = data.modules.find((m) => m.module === "RETAIL");
    if (!retail?.enabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Retail module cannot be disabled",
        path: ["modules"],
      });
    }
  });

export const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  supplier: z.string().optional(),
  price: z.number().min(0),
  cost: z.number().min(0).optional(),
  type: z.enum(["PHYSICAL", "SERVICE", "RENTAL", "DIGITAL", "CUSTOM"]).optional(),
  taxable: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
  isActive: z.boolean().optional(),
  initialStock: z.number().int().min(0).optional(),
});

export const customerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  marketingOptIn: z.boolean().optional(),
});

export const cartItemSchema = z.object({
  productId: z.string().optional(),
  variantId: z.string().optional(),
  name: z.string().min(1),
  sku: z.string().optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  taxable: z.boolean().optional(),
  modifiers: z
    .array(
      z.object({
        name: z.string(),
        priceAdjustment: z.number(),
      })
    )
    .optional(),
});

export const checkoutSchema = z.object({
  locationId: z.string(),
  customerId: z.string().optional(),
  items: z.array(cartItemSchema).min(1),
  discounts: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
        value: z.number().min(0),
      })
    )
    .optional(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["CARD", "CASH", "GIFT_CARD", "STORE_CREDIT", "MANUAL"]),
});

export const refundSchema = z.object({
  orderId: z.string(),
  reason: z.enum([
    "CUSTOMER_RETURN",
    "DAMAGED_ITEM",
    "WRONG_ITEM",
    "DUPLICATE_CHARGE",
    "CUSTOMER_SATISFACTION",
    "OTHER",
  ]),
  reasonNote: z.string().optional(),
  returnToStock: z.boolean().optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string(),
        quantity: z.number().int().min(1),
      })
    )
    .optional(),
  customAmount: z.number().min(0).optional(),
});

export const inventoryAdjustSchema = z.object({
  inventoryItemId: z.string(),
  quantity: z.number().int(),
  type: z.enum([
    "MANUAL_ADJUSTMENT",
    "DAMAGED",
    "LOST",
    "RECEIVED",
    "RETURN_TO_STOCK",
  ]),
  reason: z.string().optional(),
});

export const employeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  roleId: z.string(),
  pin: z.string().length(4).optional(),
  locationIds: z.array(z.string()).optional(),
});

export const createBusinessSchema = businessProfileSchema.extend({
  location: locationSchema.optional(),
  posConfig: posConfigSchema.optional(),
});

export const onboardingPatchSchema = z.object({
  step: z.enum([
    "BUSINESS_PROFILE",
    "LOCATION_SETUP",
    "POS_CONFIG",
    "STRIPE_CONNECT",
    "FIRST_PRODUCTS",
    "CHOOSE_PLAN",
    "COMPLETED",
  ]),
  businessProfile: businessProfileSchema.partial().optional(),
  location: locationSchema.partial().optional(),
  posConfig: posConfigSchema.partial().optional(),
  plan: z.enum(["STARTER", "PRO", "MULTI_LOCATION", "ENTERPRISE"]).optional(),
  complete: z.boolean().optional(),
});
