export const DEFAULT_EXPENSE_CATEGORIES = [
  "Fuel",
  "Office Supplies",
  "Equipment",
  "Inventory",
  "Meals",
  "Travel",
  "Hotel",
  "Airfare",
  "Vehicle Maintenance",
  "Utilities",
  "Software",
  "Subscriptions",
  "Marketing",
  "Advertising",
  "Repairs",
  "Training",
  "Professional Services",
  "Payroll Related",
  "Insurance",
  "Bank Fees",
  "Customer Entertainment",
  "Miscellaneous",
] as const;

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Fuel: ["shell", "chevron", "exxon", "bp", "gas", "fuel", "arco", "mobil", "petrol"],
  Meals: ["restaurant", "cafe", "coffee", "starbucks", "mcdonald", "dining", "food", "uber eats", "doordash"],
  Travel: ["uber", "lyft", "taxi", "transit", "parking", "toll"],
  Hotel: ["hotel", "motel", "marriott", "hilton", "airbnb", "hyatt", "inn"],
  Airfare: ["airline", "delta", "united", "american air", "southwest", "jetblue", "flight"],
  Software: ["github", "adobe", "aws", "google cloud", "microsoft", "saas", "slack", "notion"],
  Subscriptions: ["subscription", "netflix", "spotify", "membership", "recurring"],
  "Office Supplies": ["staples", "office depot", "paper", "toner", "supplies"],
  Marketing: ["ads", "facebook ads", "google ads", "campaign", "promo"],
  Advertising: ["advertising", "billboard", "ad spend"],
  Utilities: ["electric", "gas bill", "water", "internet", "comcast", "verizon"],
  Insurance: ["insurance", "geico", "progressive", "policy"],
  "Bank Fees": ["fee", "wire", "overdraft", "bank charge"],
  "Vehicle Maintenance": ["auto", "repair shop", "oil change", "tire", "mechanic"],
  Equipment: ["equipment", "hardware", "laptop", "monitor", "printer"],
  Inventory: ["wholesale", "inventory", "supplier", "sku"],
  Training: ["training", "course", "udemy", "certification", "workshop"],
  "Professional Services": ["consulting", "legal", "attorney", "accountant", "cpa"],
  "Customer Entertainment": ["entertainment", "client dinner", "hospitality"],
  Miscellaneous: [],
};

export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeVendorName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}
