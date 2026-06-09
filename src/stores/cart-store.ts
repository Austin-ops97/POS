"use client";

import { create } from "zustand";

export type CartItem = {
  id: string;
  productId?: string;
  variantId?: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
  type?: string;
  modifiers?: { name: string; priceAdjustment: number }[];
  notes?: string;
};

export type CartDiscount = {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
};

type CartState = {
  items: CartItem[];
  discounts: CartDiscount[];
  customerId: string | null;
  customerName: string | null;
  notes: string;
  heldOrderId: string | null;
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  addDiscount: (discount: CartDiscount) => void;
  removeDiscount: (id: string) => void;
  setCustomer: (id: string | null, name: string | null) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
  loadHeldOrder: (orderId: string, items: CartItem[]) => void;
};

let itemCounter = 0;

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discounts: [],
  customerId: null,
  customerName: null,
  notes: "",
  heldOrderId: null,

  addItem: (item) => {
    const existing = get().items.find(
      (i) =>
        i.productId === item.productId &&
        i.variantId === item.variantId &&
        JSON.stringify(i.modifiers) === JSON.stringify(item.modifiers)
    );
    if (existing) {
      set({
        items: get().items.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i
        ),
      });
    } else {
      set({
        items: [...get().items, { ...item, id: `item-${++itemCounter}` }],
      });
    }
  },

  removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(id);
    } else {
      set({
        items: get().items.map((i) => (i.id === id ? { ...i, quantity } : i)),
      });
    }
  },

  addDiscount: (discount) =>
    set({ discounts: [...get().discounts, discount] }),

  removeDiscount: (id) =>
    set({ discounts: get().discounts.filter((d) => d.id !== id) }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  setNotes: (notes) => set({ notes }),

  clearCart: () =>
    set({
      items: [],
      discounts: [],
      customerId: null,
      customerName: null,
      notes: "",
      heldOrderId: null,
    }),

  loadHeldOrder: (orderId, items) =>
    set({ heldOrderId: orderId, items }),
}));
