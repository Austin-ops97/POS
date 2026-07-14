# NexaPOS

An authenticated, fully featured Stripe-powered POS platform for retail, services, rentals, and restaurants.

Sign in once and land in a completely unlocked account — no trials, plans, or paywalls. Employee role permissions and multi-tenant isolation still apply.

## Features

- **Fast Checkout** — Tablet-optimized register with barcode scanning and category tabs
- **Stripe Payments** — PaymentIntents, Stripe Terminal, Tap to Pay, Connect onboarding
- **Inventory Management** — Stock tracking, transfers, adjustments, low-stock alerts
- **Multi-Location** — Manage multiple stores from one account
- **Employee Permissions** — Role-based access with PIN login for registers
- **Reports & Analytics** — Sales dashboards, charts, and exportable reports
- **Refunds & Receipts** — Full/partial refunds via Stripe with digital receipts
- **Workforce** — Scheduling, time clock, PTO, and payroll exports

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** Clerk
- **Payments:** Stripe (Connect, Terminal, Webhooks)
- **State:** Zustand
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Clerk account ([clerk.com](https://clerk.com))
- Stripe account ([stripe.com](https://stripe.com))

### 1. Clone and Install

```bash
git clone <repo-url>
cd nexapos
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL pooled connection string (Neon pooler OK) |
| `DIRECT_URL` | PostgreSQL direct connection for migrations (Neon non-pooler host) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_APP_URL` | App URL (e.g. `http://localhost:3000`) |

### 3. Database Setup

```bash
npx prisma migrate dev
npm run db:seed
```

The seed only creates system roles and permissions — no demo merchant data.

For production, use `npx prisma migrate deploy`. Do not seed production unless you intend to refresh system roles.

### 4. Stripe Webhook (Development)

Use the Stripe CLI to forward webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in `.env`.

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in; a blank business is provisioned automatically on first login.

## Project Structure

```
src/
├── app/
│   ├── (marketing)/     # Minimal login landing page
│   ├── (dashboard)/     # Authenticated app
│   ├── onboarding/      # Redirects to /dashboard
│   └── api/             # API routes
├── components/
│   ├── ui/              # UI primitives
│   ├── dashboard/       # Dashboard components
│   └── register/        # Checkout components
├── lib/                 # Utilities, auth, stripe, validations
└── stores/              # Zustand stores
```

## Stripe Integration

### Connect (Merchant Onboarding)
Merchants connect their Stripe account via Settings → Payments. Uses Stripe Connect Express accounts.

### PaymentIntents
Card payments use PaymentIntents created server-side. Webhooks confirm payment success — the frontend never marks orders as paid.

### Terminal
Register card readers in Settings → Payments → Stripe Terminal. Use Stripe test readers only in development.

## Security

- No raw card data stored
- Stripe webhook signature verification
- Backend recalculates all order totals
- Role-based access control (RBAC)
- All queries scoped by `businessId`
- Employee PINs hashed with bcrypt
- Audit logging for sensitive actions

## Deployment

Designed for deployment on:

- **Frontend/API:** Vercel
- **Database:** Supabase, Railway, or any PostgreSQL provider
- **Auth:** Clerk (hosted)
- **Payments:** Stripe (hosted)

```bash
npm run build
```

See [PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md) for the Vercel, database, Clerk, and Stripe checklist.

## License

Private — All rights reserved.
