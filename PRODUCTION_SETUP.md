# Production Setup

EmeraldOne runs as an authenticated, fully unlocked POS. After Clerk sign-in, users are provisioned automatically and land on the dashboard. There are no trials, subscription plans, or commercial paywalls.

## Required Services

1. Vercel project connected to this GitHub repo.
2. PostgreSQL database reachable from Vercel.
3. Clerk application for sign-in and user sessions.
4. Stripe account for merchant payments, webhooks, Connect, and Terminal.

## Vercel Environment Variables

Set these in Vercel under Project Settings -> Environment Variables.

```txt
# Neon pooled URL for the app runtime
DATABASE_URL=postgresql://...-pooler....neon.tech/neondb?sslmode=require
# Neon direct URL for Prisma migrations (hostname without -pooler)
DIRECT_URL=postgresql://....neon.tech/neondb?sslmode=require

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

# Optional: external product barcode lookup (Open Facts)
PRODUCT_LOOKUP_ENABLED=true
PRODUCT_LOOKUP_USER_AGENT="EmeraldOne/0.1.0 (support@your-domain.com)"
PRODUCT_LOOKUP_CACHE_DAYS=30
```

If `DIRECT_URL` is omitted, the Prisma CLI helper derives it by removing `-pooler` from `DATABASE_URL`, then forces both `DATABASE_URL` and `DIRECT_URL` for the Prisma subprocess only. Prefer setting `DIRECT_URL` explicitly in Vercel. The Next.js app runtime continues to use the pooled `DATABASE_URL`.
Camera barcode scanning requires HTTPS outside localhost (iPhone Safari, installed PWAs, Android Chrome).

Use live Clerk and Stripe keys only when the store is ready to process real customers and payments.

## Database Setup

Run migrations against the production database before using the app (uses `DIRECT_URL` when set):

```bash
npm run build
# or:
node scripts/prisma-with-direct.mjs migrate deploy
```

Vercel production builds already run `migrate deploy` via `npm run build`. Vercel preview builds skip migrate so an unmerged schema cannot block the required GitHub check or mutate a shared production database. Deploying `main` applies any pending additive migrations, including payroll correctness (`20260815090000_payroll_correctness`), inventory/customers/signatures (`20260815100000_inventory_customers_signatures`), the PTO accrual job (`20260815180000_pto_accrual_job`), and reminder alerts (`20260825120000_reminder_alerts_and_preferences`). That reminder migration is idempotent; a production `migrate deploy` will mark a failed apply rolled back and retry it once.

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
5. Card checkout on the register is online card entry through Stripe Connect. Tap to Pay uses a configured Stripe Terminal smart reader (server-driven `card_present`). A phone browser cannot NFC-tap; Tap to Pay on iPhone needs a native app. See `docs/stripe-terminal-tap-to-pay.md`.

## First Use

1. Open the deployed app (minimal login landing page).
2. Sign up or sign in through Clerk.
3. The app automatically provisions a business, default location, Owner employee, settings, modules, tax rate, and Stripe Connect placeholder.
4. Add products, tax rates, employees, and payment hardware in Settings.
5. Open `/register` to start checkout.

## Cron jobs

Set `CRON_SECRET` in Vercel. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/reminders` | `0 8 * * *` (08:00 UTC daily) | Due project reminders: in-app notifications + Resend email |
| `/api/cron/pto-accrual` | `15 8 * * *` (08:15 UTC daily) | Recurring / annual PTO grants |

Project reminder alerts require `RESEND_API_KEY` and `OFFICE_FROM_EMAIL` (or `RECEIPTS_FROM_EMAIL`). Employees can disable email or in-app reminder alerts from the notification bell. `vercel.json` uses daily crons so Hobby deploys are not rejected. On a paid Vercel plan you can change the reminders schedule to `*/5 * * * *`, or keep the daily cron and hit `/api/cron/reminders` every few minutes from an external scheduler with `Authorization: Bearer $CRON_SECRET`.

## Digital business cards and Apple Wallet

Office → Digital Business Cards publishes a stable public page at `/c/{slug}`. The QR code and Apple Wallet pass both open that page. They do not add a contact. The visitor taps **Save to Contacts** to download a vCard.

Card logos upload to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set. Otherwise the image is stored on the card row and served from the public card URL. Set `NEXT_PUBLIC_APP_URL` so QR codes, Wallet passes, and iMessage previews use an absolute link.

Apple Wallet downloads stay disabled until a Pass Type ID certificate is configured. Set these in the host environment, then reload the editor:

```txt
PASSKIT_PASS_TYPE_IDENTIFIER=pass.com.yourcompany.emeraldone.card
PASSKIT_TEAM_IDENTIFIER=ABCDE12345
PASSKIT_CERT_P12_BASE64=base64-of-the-pass-type-id-p12
PASSKIT_CERT_PASSPHRASE=the-p12-passphrase
PASSKIT_WWDR_PEM=Apple WWDR intermediate PEM
```

`PASSKIT_WWDR_PEM` accepts a PEM block, the same PEM with newline characters written as `\n`, or base64 of the PEM text. Download the Apple Worldwide Developer Relations intermediate (G4) from the Apple developer certificates page. Export the Pass Type ID certificate together with its private key as a `.p12`, then base64-encode that file for `PASSKIT_CERT_P12_BASE64`. If the `.p12` has no passphrase, set `PASSKIT_CERT_PASSPHRASE` to an empty value so the app can tell it apart from a missing setting. Do not commit the certificate or passphrase.

## End-to-end tests

Public marketing routes can be run with `npm run test:e2e:public` after a production build and real Clerk keys. Authenticated dashboard and register flows need a Clerk session file:

```bash
PLAYWRIGHT_STORAGE_STATE=/path/to/clerk-storage.json npm run test:e2e
```

Database-backed tests need a reachable `DATABASE_URL` / `DIRECT_URL` and `RUN_DB_TESTS=1`. `npm test` covers accrual, payroll, and checkout logic without a live database.
