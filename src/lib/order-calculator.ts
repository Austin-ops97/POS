export type CartItemInput = {
  productId?: string;
  variantId?: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
  modifiers?: { name: string; priceAdjustment: number }[];
};

export type DiscountInput = {
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  name: string;
};

export type TaxRateInput = {
  name: string;
  rate: number;
  appliesToProducts: boolean;
  appliesToServices: boolean;
};

export type OrderTotals = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  items: {
    name: string;
    sku?: string;
    productId?: string;
    variantId?: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    modifiers?: { name: string; priceAdjustment: number }[];
  }[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateOrderTotals(
  items: CartItemInput[],
  discounts: DiscountInput[] = [],
  taxRates: TaxRateInput[] = [],
  productTypes: Record<string, "PHYSICAL" | "SERVICE" | "RENTAL" | "DIGITAL" | "CUSTOM"> = {}
): OrderTotals {
  const calculatedItems = items.map((item) => {
    const modifierTotal = (item.modifiers || []).reduce(
      (sum, m) => sum + m.priceAdjustment,
      0
    );
    const lineSubtotal = round2((item.unitPrice + modifierTotal) * item.quantity);
    return {
      ...item,
      lineSubtotal,
      discountAmount: 0,
      taxAmount: 0,
      total: lineSubtotal,
    };
  });

  let subtotal = round2(
    calculatedItems.reduce((sum, item) => sum + item.lineSubtotal, 0)
  );

  let discountAmount = 0;
  for (const discount of discounts) {
    if (discount.type === "PERCENTAGE") {
      discountAmount += round2(subtotal * (discount.value / 100));
    } else {
      discountAmount += discount.value;
    }
  }
  discountAmount = round2(Math.min(discountAmount, subtotal));

  const taxableSubtotal = subtotal - discountAmount;

  const defaultTaxRate = taxRates.find((t) => t.appliesToProducts) || taxRates[0];
  const taxRate = defaultTaxRate?.rate || 0;

  let taxAmount = 0;
  const finalItems = calculatedItems.map((item) => {
    const isTaxable = item.taxable !== false;
    const itemDiscountShare =
      subtotal > 0
        ? round2((item.lineSubtotal / subtotal) * discountAmount)
        : 0;
    const itemTaxableAmount = item.lineSubtotal - itemDiscountShare;
    const itemTax = isTaxable ? round2(itemTaxableAmount * taxRate) : 0;
    taxAmount += itemTax;

    return {
      name: item.name,
      sku: item.sku,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: itemDiscountShare,
      taxAmount: itemTax,
      total: round2(item.lineSubtotal - itemDiscountShare + itemTax),
      modifiers: item.modifiers,
    };
  });

  taxAmount = round2(taxAmount);
  const total = round2(taxableSubtotal + taxAmount);

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total,
    items: finalItems,
  };
}
