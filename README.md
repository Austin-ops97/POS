# NexaPOS

An authenticated Stripe-powered POS platform for retail checkout, inventory, workforce, and expenses.

Sign in once and land in a completely unlocked account — no trials, plans, or paywalls. Employee role permissions and multi-tenant isolation still apply.

## Features

- **Fast Checkout** — Tablet-optimized register with barcode scanning and category tabs
- **Stripe Payments** — PaymentIntents, Connect onboarding, and Terminal reader registration in Settings
- **Cash Drawer Sessions** — Open/close register floats tied to cash sales and refunds
- **Inventory Management** — Stock tracking, location transfers, adjustments, low-stock alerts
- **Multi-Location** — Manage multiple stores from one account
- **Employee Permissions** — Role-based access with PIN unlock for registers
- **Reports & Analytics** — Sales dashboards, charts, and CSV export
- **Refunds & Receipts** — Full/partial refunds via Stripe with digital receipts
- **Workforce** — Scheduling, time clock, PTO, and payroll exports
- **Expenses / Finance** — Company cards, approvals, budgets, and receipt capture

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js API Routes
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** Clerk
- **Payments:** Stripe (Connect, Terminal APIs, Webhooks)
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

For local development without Clerk, set `ALLOW_DEV_AUTH_BYPASS=true` (never in production).

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
npx prisma migrate deploy
# or during local schema iteration:
# npx prisma migrate dev
npm run db:seed
```

The seed only creates system roles and permissions — no demo merchant data.

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
│   ├── (marketing)/     # Landing / auth entry
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
Card payments on the register use Stripe Elements / PaymentIntents created server-side. Webhooks confirm payment success — the frontend never marks orders as paid.

### Terminal
Register and manage Stripe Terminal readers in Settings → Payments. Connection tokens are available via API for future reader-present checkout. Register checkout today uses online card entry, not Tap to Pay on phone.

## Security

- No raw card data stored
- Stripe webhook signature verification
- Backend recalculates all order totals
- Role-based access control (RBAC)
- All queries scoped by `businessId`
- Employee PINs hashed with bcrypt; register PIN unlock uses a signed httpOnly cookie for sale attribution
- Audit logging for sensitive actions
- Production refuses to run without Clerk unless an explicit local-only bypass is set

## Deployment

Designed for deployment on:

- **Frontend/API:** Vercel
- **Database:** Neon, Supabase, Railway, or any PostgreSQL provider
- **Auth:** Clerk (hosted)
- **Payments:** Stripe (hosted)
