# Production Setup

This app is configured to run as a real POS system, not a demo storefront. The root URL redirects to the register, authenticated routes are protected by Clerk, and demo mode is disabled in code.

## Required Services

1. Vercel project connected to this GitHub repo.
2. PostgreSQL database reachable from Vercel.
3. Clerk application for sign-in and user sessions.
4. Stripe account for payments, webhooks, Connect, Billing, and Terminal.

## Vercel Environment Variables

Set these in Vercel under Project Settings -> Environment Variables.

```txt
DATABASE_URL=postgresql://...

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
CLERK_SECRET_KEY=sk_live_or_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/register
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_MULTI=price_...
STRIPE_PRICE_ENTERPRISE=price_...

NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

Use live Clerk and Stripe keys only when the store is ready to process real customers and payments.

## Database Setup

Run migrations against the production database before using the app:

```bash
npx prisma migrate deploy
```

Do not run the seed script in production unless you intentionally want sample products, customers, and orders.

## Stripe Setup

1. Create products and recurring prices in Stripe Billing, then copy their price IDs into the `STRIPE_PRICE_*` env vars.
2. Configure a Stripe webhook endpoint:

```txt
https://your-production-domain.com/api/webhooks/stripe
```

3. Add the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Enable Stripe Connect and set `STRIPE_CONNECT_CLIENT_ID`.
5. For in-person card payments, configure Stripe Terminal locations/readers in Stripe and connect the merchant account through Settings -> Payments.

## First Use

1. Open the deployed app.
2. Sign up or sign in through Clerk.
3. Complete onboarding to create the business, owner profile, default location, tax rate, settings, and initial products.
4. Add real products, tax rates, employees, and payment hardware.
5. Open `/register` to start checkout.
