import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export const STRIPE_PLANS = {
  STARTER: {
    name: "Starter",
    price: 2900,
    priceId: process.env.STRIPE_PRICE_STARTER || "price_starter",
    features: ["1 location", "Basic POS", "Basic inventory", "Basic reports"],
  },
  PRO: {
    name: "Pro",
    price: 7900,
    priceId: process.env.STRIPE_PRICE_PRO || "price_pro",
    features: [
      "Advanced inventory",
      "Employee permissions",
      "Customer profiles",
      "Advanced reports",
      "Stripe Terminal",
    ],
  },
  MULTI_LOCATION: {
    name: "Multi-Location",
    price: 14900,
    priceId: process.env.STRIPE_PRICE_MULTI || "price_multi",
    features: [
      "Multiple locations",
      "Inventory transfers",
      "Location reporting",
      "Advanced roles",
    ],
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: 0,
    priceId: process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise",
    features: ["Custom pricing", "API access", "Priority support", "White-label"],
  },
} as const;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripePublishableKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    null
  );
}

export function getStripePublishableKeyOrThrow(): string {
  const key = getStripePublishableKey();
  if (!key) {
    throw new Error(
      "Stripe publishable key is not configured. Set STRIPE_PUBLISHABLE_KEY or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY."
    );
  }
  return key;
}

export function getStripeOrThrow(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment."
    );
  }

  stripeClient ??= new Stripe(secretKey, {
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
  });

  return stripeClient;
}
