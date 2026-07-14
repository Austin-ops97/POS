# Production Setup

NexaPOS runs as an authenticated, fully unlocked POS. After Clerk sign-in, users are provisioned automatically and land on the dashboard. There are no trials, subscription plans, or commercial paywalls.

## Required Services

1. Vercel project connected to this GitHub repo.
2. PostgreSQL database reachable from Vercel.
3. Clerk application for sign-in and user sessions.
4. Stripe account for merchant payments, webhooks, Connect, and Terminal.

## Vercel Environment Variables

Set these in Vercel under Project Settings -> Environment Variables.

```txt
DATABASE_URL=postgresql://...

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
CLERK_SECRET_KEY=sk_live_or_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

Use live Clerk and Stripe keys only when the store is ready to process real customers and payments.

## Database Setup

Run migrations against the production database before using the app:

```bash
npx prisma migrate deploy
```

The `20260714180000_remove_demo_subscription_onboarding` migration removes confirmed demo seed records and drops the Subscription / onboarding schema. Review it before applying to production.

Optional: seed system roles and permissions only (no merchant data):

```bash
npm run db:seed
```

## Stripe Setup

1. Configure a Stripe webhook endpoint:

```txt
https://your-production-domain.com/api/webhooks/stripe
```

2. Subscribe to Connect/payment events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`.
3. Add the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Enable Stripe Connect and set `STRIPE_CONNECT_CLIENT_ID`.
5. For in-person card payments, configure Stripe Terminal locations/readers in Stripe and connect the merchant account through Settings -> Payments.

## First Use

1. Open the deployed app (minimal login landing page).
2. Sign up or sign in through Clerk.
3. The app automatically provisions a business, default location, Owner employee, settings, modules, tax rate, and Stripe Connect placeholder.
4. Add products, tax rates, employees, and payment hardware in Settings.
5. Open `/register` to start checkout.
