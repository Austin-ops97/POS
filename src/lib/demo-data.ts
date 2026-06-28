import type { AuthContext } from "./auth";

export const DEMO_BUSINESS_ID = "demo-business";
export const DEMO_LOCATION_ID = "demo-location";

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

export const demoAuthContext: AuthContext = {
  clerkId: "demo-clerk",
  userId: "demo-user",
  email: "demo@nexapos.com",
  business: {
    id: DEMO_BUSINESS_ID,
    name: "Demo Market & Services",
    legalName: "Demo Market & Services LLC",
    type: "HYBRID",
    phone: "(555) 123-4567",
    email: "demo@nexapos.com",
    website: "https://demo.nexapos.com",
    logoUrl: null,
    primaryColor: "#1e3a5f",
    onboardingStep: "COMPLETED",
    onboardingComplete: true,
    demoMode: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  },
  location: {
    id: DEMO_LOCATION_ID,
    businessId: DEMO_BUSINESS_ID,
    name: "Main Store",
    street: "123 Commerce St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    country: "US",
    timezone: "America/Chicago",
    taxRegion: "TX",
    isActive: true,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  },
  employee: {
    id: "demo-owner",
    businessId: DEMO_BUSINESS_ID,
    userId: "demo-user",
    roleId: "role-owner",
    name: "Alex Owner",
    email: "demo@nexapos.com",
    phone: null,
    pinHash: null,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    role: {
      name: "Owner",
      permissions: [],
    },
    locations: [
      {
        locationId: DEMO_LOCATION_ID,
        location: {
          id: DEMO_LOCATION_ID,
          businessId: DEMO_BUSINESS_ID,
          name: "Main Store",
          street: "123 Commerce St",
          city: "Austin",
          state: "TX",
          zip: "78701",
          country: "US",
          timezone: "America/Chicago",
          taxRegion: "TX",
          isActive: true,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      },
    ],
    business: {
      id: DEMO_BUSINESS_ID,
      name: "Demo Market & Services",
      legalName: "Demo Market & Services LLC",
      type: "HYBRID",
      phone: "(555) 123-4567",
      email: "demo@nexapos.com",
      website: "https://demo.nexapos.com",
      logoUrl: null,
      primaryColor: "#1e3a5f",
      onboardingStep: "COMPLETED",
      onboardingComplete: true,
      demoMode: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  },
};

export const demoCategories = [
  { id: "cat-apparel", name: "Apparel", businessId: DEMO_BUSINESS_ID },
  { id: "cat-electronics", name: "Electronics", businessId: DEMO_BUSINESS_ID },
  { id: "cat-drinks", name: "Drinks", businessId: DEMO_BUSINESS_ID },
  { id: "cat-services", name: "Services", businessId: DEMO_BUSINESS_ID },
  { id: "cat-rentals", name: "Rentals", businessId: DEMO_BUSINESS_ID },
];

export const demoProducts = [
  { id: "prod-tshirt", name: "T-Shirt", sku: "APP-001", barcode: "100000000001", price: 24.99, cost: 8, type: "PHYSICAL", categoryId: "cat-apparel", category: { id: "cat-apparel", name: "Apparel" }, isActive: true, isFavorite: true, trackInventory: true, taxable: true },
  { id: "prod-hat", name: "Hat", sku: "APP-002", barcode: "100000000002", price: 19.99, cost: 6, type: "PHYSICAL", categoryId: "cat-apparel", category: { id: "cat-apparel", name: "Apparel" }, isActive: true, isFavorite: false, trackInventory: true, taxable: true },
  { id: "prod-coffee", name: "Coffee", sku: "DRK-001", barcode: "100000000003", price: 4.5, cost: 1.2, type: "PHYSICAL", categoryId: "cat-drinks", category: { id: "cat-drinks", name: "Drinks" }, isActive: true, isFavorite: true, trackInventory: true, taxable: true },
  { id: "prod-charger", name: "Phone Charger", sku: "ELC-001", barcode: "100000000004", price: 29.99, cost: 12, type: "PHYSICAL", categoryId: "cat-electronics", category: { id: "cat-electronics", name: "Electronics" }, isActive: true, isFavorite: false, trackInventory: true, taxable: true },
  { id: "prod-service", name: "Service Labor - 1 Hour", sku: "SVC-001", barcode: null, price: 85, cost: 0, type: "SERVICE", categoryId: "cat-services", category: { id: "cat-services", name: "Services" }, isActive: true, isFavorite: false, trackInventory: false, taxable: true },
  { id: "prod-rental", name: "Equipment Rental - Daily", sku: "RNT-001", barcode: null, price: 45, cost: 0, type: "RENTAL", categoryId: "cat-rentals", category: { id: "cat-rentals", name: "Rentals" }, isActive: true, isFavorite: false, trackInventory: false, taxable: true },
  { id: "prod-custom", name: "Custom Fee", sku: "CUS-001", barcode: null, price: 0, cost: 0, type: "CUSTOM", categoryId: "cat-services", category: { id: "cat-services", name: "Services" }, isActive: true, isFavorite: false, trackInventory: false, taxable: false },
];

export const demoCustomers = [
  { id: "cust-john", firstName: "John", lastName: "Smith", email: "john@example.com", phone: "555-0101", createdAt: now },
  { id: "cust-sarah", firstName: "Sarah", lastName: "Johnson", email: "sarah@example.com", phone: "555-0102", createdAt: now },
  { id: "cust-biz", firstName: "Business Account", lastName: "Customer", email: "accounts@bizcorp.com", phone: "555-0103", createdAt: now },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const demoOrders: any[] = [
  {
    id: "order-paid-card",
    orderNumber: "ORD-DEMO-001",
    status: "PAID",
    total: 31.92,
    subtotal: 29.49,
    taxAmount: 2.43,
    discountAmount: 0,
    customerId: "cust-john",
    customer: { firstName: "John", lastName: "Smith" },
    employee: { name: "Chris Cashier" },
    paidAt: new Date(today.getTime() + 10 * 60 * 60 * 1000),
    createdAt: new Date(today.getTime() + 10 * 60 * 60 * 1000),
    items: [
      { id: "oi-1", name: "Coffee", quantity: 2, unitPrice: 4.5, total: 9.74 },
      { id: "oi-2", name: "Phone Charger", quantity: 1, unitPrice: 29.99, total: 32.46 },
    ],
    payments: [{ id: "pay-1", method: "CARD", status: "SUCCEEDED", amount: 31.92, cardLast4: "4242", cardBrand: "visa" }],
    refunds: [],
  },
  {
    id: "order-paid-cash",
    orderNumber: "ORD-DEMO-002",
    status: "PAID",
    total: 27.05,
    subtotal: 24.99,
    taxAmount: 2.06,
    discountAmount: 0,
    customerId: "cust-sarah",
    customer: { firstName: "Sarah", lastName: "Johnson" },
    employee: { name: "Chris Cashier" },
    paidAt: new Date(today.getTime() + 12 * 60 * 60 * 1000),
    createdAt: new Date(today.getTime() + 12 * 60 * 60 * 1000),
    items: [{ id: "oi-3", name: "T-Shirt", quantity: 1, unitPrice: 24.99, total: 27.05 }],
    payments: [{ id: "pay-2", method: "CASH", status: "SUCCEEDED", amount: 27.05 }],
    refunds: [],
  },
  {
    id: "order-refunded",
    orderNumber: "ORD-DEMO-003",
    status: "REFUNDED",
    total: 32.46,
    subtotal: 29.99,
    taxAmount: 2.47,
    discountAmount: 0,
    customerId: "cust-biz",
    customer: { firstName: "Business Account", lastName: "Customer" },
    employee: { name: "Maria Manager" },
    paidAt: new Date(today.getTime() - 24 * 60 * 60 * 1000),
    createdAt: new Date(today.getTime() - 24 * 60 * 60 * 1000),
    items: [{ id: "oi-4", name: "Phone Charger", quantity: 1, unitPrice: 29.99, total: 32.46 }],
    payments: [{ id: "pay-3", method: "CARD", status: "SUCCEEDED", amount: 32.46, cardLast4: "4242" }],
    refunds: [{ id: "ref-1", amount: 32.46, reason: "CUSTOMER_RETURN", createdAt: now }],
  },
  {
    id: "order-held",
    orderNumber: "ORD-DEMO-004",
    status: "HELD",
    total: 4.87,
    subtotal: 4.5,
    taxAmount: 0.37,
    discountAmount: 0,
    customerId: null,
    customer: null,
    employee: { name: "Chris Cashier" },
    paidAt: null,
    heldAt: now,
    createdAt: now,
    items: [{ id: "oi-5", name: "Coffee", quantity: 1, unitPrice: 4.5, total: 4.87 }],
    payments: [],
    refunds: [],
  },
];

export const demoInventory = demoProducts
  .filter((p) => p.trackInventory)
  .map((p) => ({
    id: `inv-${p.id}`,
    productId: p.id,
    product: p,
    locationId: DEMO_LOCATION_ID,
    quantityOnHand: p.id === "prod-charger" ? 3 : 50,
    quantityReserved: 0,
    reorderPoint: 10,
    costPerUnit: p.cost,
  }));

export const demoEmployees = [
  { id: "demo-owner", name: "Alex Owner", email: "owner@demo.nexapos.com", status: "ACTIVE", role: { name: "Owner" } },
  { id: "demo-manager", name: "Maria Manager", email: "manager@demo.nexapos.com", status: "ACTIVE", role: { name: "Manager" } },
  { id: "demo-cashier", name: "Chris Cashier", email: "cashier@demo.nexapos.com", status: "ACTIVE", role: { name: "Cashier" } },
];

export const demoDashboardStats = {
  todaySales: 58.97,
  transactionCount: 2,
  aov: 29.49,
  refundTotal: 32.46,
  cardSales: 31.92,
  cashSales: 27.05,
  salesByHour: [
    { hour: "9 AM", sales: 0 },
    { hour: "10 AM", sales: 31.92 },
    { hour: "11 AM", sales: 0 },
    { hour: "12 PM", sales: 27.05 },
    { hour: "1 PM", sales: 0 },
    { hour: "2 PM", sales: 0 },
    { hour: "3 PM", sales: 0 },
    { hour: "4 PM", sales: 0 },
    { hour: "5 PM", sales: 0 },
  ],
  topProducts: [
    { name: "Coffee", quantity: 3, revenue: 13.5 },
    { name: "T-Shirt", quantity: 1, revenue: 24.99 },
    { name: "Phone Charger", quantity: 1, revenue: 29.99 },
  ],
  lowStock: demoInventory.filter((i) => i.quantityOnHand <= i.reorderPoint),
};

export const demoStripeAccount = {
  status: "NOT_CONNECTED",
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
};

export const demoSubscription = {
  plan: "PRO",
  status: "TRIALING",
  trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
};

export const demoTaxRates = [
  { id: "demo-tax", name: "Sales Tax", rate: 0.0825, isActive: true, appliesToProducts: true, appliesToServices: true },
];

export const demoModules = [
  { module: "retail", enabled: true },
  { module: "service", enabled: true },
  { module: "rental", enabled: true },
  { module: "restaurant", enabled: false },
];

export const demoSettings = {
  enableCash: true,
  enableCard: true,
  receiptFooter: "Thank you for shopping at Demo Market & Services!",
  returnPolicy: "Returns accepted within 30 days with receipt.",
  showCashierOnReceipt: true,
  showCustomerOnReceipt: true,
  showBusinessEmailOnReceipt: true,
  showBusinessPhoneOnReceipt: true,
  showSkuOnReceipt: false,
  enableReceiptPrinting: true,
};

// Mutable demo orders for checkout simulation
let demoOrderCounter = 100;

export function createDemoOrder(params: {
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  taxAmount: number;
  total: number;
  paymentMethod: "CARD" | "CASH";
  status?: string;
}) {
  demoOrderCounter++;
  const order = {
    id: `order-demo-${demoOrderCounter}`,
    orderNumber: `ORD-DEMO-${demoOrderCounter}`,
    status: params.status || "PAID",
    total: params.total,
    subtotal: params.subtotal,
    taxAmount: params.taxAmount,
    discountAmount: 0,
    customerId: null,
    customer: null,
    employee: { name: "Alex Owner" },
    paidAt: new Date(),
    createdAt: new Date(),
    items: params.items.map((item, i) => ({
      id: `oi-new-${demoOrderCounter}-${i}`,
      ...item,
    })),
    payments: [
      {
        id: `pay-new-${demoOrderCounter}`,
        method: params.paymentMethod,
        status: "SUCCEEDED",
        amount: params.total,
        cardLast4: params.paymentMethod === "CARD" ? "4242" : null,
        cardBrand: params.paymentMethod === "CARD" ? "visa" : null,
      },
    ],
    refunds: [],
  };
  demoOrders.unshift(order);
  return order;
}
