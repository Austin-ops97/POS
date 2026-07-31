import { MODULE_SETTING_KEYS } from "./validations";

/** Canonical module keys used for ModuleSetting records. */
export const CANONICAL_MODULE_KEYS = MODULE_SETTING_KEYS;

export const CUSTOMER_CONFIGURABLE_MODULES = [
  { key: "POS", name: "Point of Sale", description: "Register and checkout" },
  { key: "PAYMENTS", name: "Payments", description: "Payment activity and Stripe tools" },
  { key: "CATALOG", name: "Catalog", description: "Products, pricing, and categories" },
  { key: "INVENTORY", name: "Inventory", description: "Stock control and scanning" },
  { key: "ORDERS", name: "Orders", description: "Order history, receipts, and refunds" },
  { key: "CUSTOMERS", name: "Customers", description: "Customer profiles and history" },
  { key: "REPORTS", name: "Reports", description: "Sales and operational reports" },
  { key: "WORKFORCE", name: "Workforce", description: "Employees, schedules, time clock, and payroll" },
  { key: "CONNECTIONS", name: "Connections", description: "Private employee and team messaging" },
  { key: "EXPENSES", name: "Expenses", description: "Cards, reimbursements, budgets, and approvals" },
  { key: "OFFICE", name: "Office", description: "Documents, projects, forms, and workflows" },
] as const;

export type AppModuleKey = (typeof CUSTOMER_CONFIGURABLE_MODULES)[number]["key"];

/**
 * Every implemented module enabled by default for newly provisioned businesses.
 */
export function defaultEnabledModules(): Array<{
  module: (typeof MODULE_SETTING_KEYS)[number];
  enabled: boolean;
}> {
  return MODULE_SETTING_KEYS.map((module) => ({
    module,
    enabled: !["SERVICE", "RENTAL", "RESTAURANT", "LOYALTY", "GIFT_CARDS"].includes(module),
  }));
}

/** Normalize legacy lowercase / alias module keys to canonical uppercase. */
export function normalizeModuleKey(key: string): string {
  const aliases: Record<string, string> = {
    retail: "RETAIL",
    pos: "POS",
    payments: "PAYMENTS",
    catalog: "CATALOG",
    service: "SERVICE",
    rental: "RENTAL",
    restaurant: "RESTAURANT",
    loyalty: "LOYALTY",
    gift_cards: "GIFT_CARDS",
    giftcards: "GIFT_CARDS",
    inventory: "INVENTORY",
    orders: "ORDERS",
    customers: "CUSTOMERS",
    reports: "REPORTS",
    workforce: "WORKFORCE",
    connections: "CONNECTIONS",
    messages: "CONNECTIONS",
    expenses: "EXPENSES",
    finance: "EXPENSES",
    expense_management: "EXPENSES",
    office: "OFFICE",
    documents: "OFFICE",
    admin: "OFFICE",
  };
  const lower = key.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  const upper = key.toUpperCase();
  if ((MODULE_SETTING_KEYS as readonly string[]).includes(upper)) return upper;
  return upper;
}
