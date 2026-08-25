export type CheckoutCartItem = {
  productId?: string;
  variantId?: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
  modifiers?: { name: string; priceAdjustment: number }[];
};

export type CheckoutDiscount = {
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
};

export function buildCheckoutPayload(input: {
  locationId: string | null;
  customerId: string | null;
  items: CheckoutCartItem[];
  discounts: CheckoutDiscount[];
  notes: string;
}) {
  return {
    locationId: input.locationId,
    customerId: input.customerId || undefined,
    items: input.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxable: item.taxable,
      modifiers: item.modifiers,
    })),
    discounts: input.discounts.map((discount) => ({
      name: discount.name,
      type: discount.type,
      value: discount.value,
    })),
    notes: input.notes || undefined,
  };
}
