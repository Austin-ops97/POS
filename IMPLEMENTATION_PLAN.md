# NexaPOS Implementation Plan

## Folder Structure

```
src/
├── app/
│   ├── (marketing)/              # Public marketing site
│   │   ├── page.tsx              # Home
│   │   ├── features/
│   │   ├── pricing/
│   │   ├── industries/
│   │   ├── hardware/
│   │   └── contact/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/
│   │   ├── sign-up/[[...sign-up]]/
│   │   └── onboarding/           # 6-step wizard
│   ├── (dashboard)/              # Authenticated app
│   │   ├── layout.tsx            # Sidebar + topbar
│   │   ├── dashboard/
│   │   ├── register/             # Checkout screen
│   │   ├── products/
│   │   ├── inventory/
│   │   ├── orders/
│   │   ├── customers/
│   │   ├── employees/
│   │   ├── reports/
│   │   └── settings/
│   └── api/
│       ├── webhooks/stripe/
│       ├── stripe/
│       ├── checkout/
│       ├── orders/
│       ├── products/
│       ├── inventory/
│       ├── customers/
│       ├── employees/
│       ├── reports/
│       ├── business/
│       ├── locations/
│       └── settings/
├── components/
│   ├── ui/                       # shadcn-style primitives
│   ├── marketing/
│   ├── dashboard/
│   └── register/
├── lib/
│   ├── db.ts
│   ├── stripe.ts
│   ├── auth.ts
│   ├── permissions.ts
│   ├── order-calculator.ts
│   ├── audit.ts
│   └── validations/
├── stores/
│   └── cart-store.ts
├── types/
│   └── index.ts
└── middleware.ts
prisma/
├── schema.prisma
└── seed.ts
```

## Database Schema

Multi-tenant with `businessId` on all operational tables. Key models:

- **Business** – tenant root, onboarding status, branding
- **Location** – multi-location support
- **User** – Clerk-linked users
- **EmployeeProfile** – per-business employee with PIN, role, locations
- **Role / Permission** – RBAC
- **Product / ProductVariant / Category** – catalog
- **ModifierGroup / ModifierOption** – item modifiers
- **InventoryItem / InventoryMovement** – stock tracking
- **Customer** – CRM with Stripe customer ID
- **Order / OrderItem / Payment / Refund** – sales lifecycle
- **Discount / TaxRate** – pricing rules
- **Receipt** – receipt records
- **RegisterSession / CashMovement** – cash drawer
- **StripeAccount / TerminalReader** – Stripe Connect + Terminal
- **Subscription** – SaaS billing via Stripe Billing
- **AuditLog / ModuleSetting / BusinessSetting** – audit + config

## Main Pages

| Section | Routes |
|---------|--------|
| Marketing | `/`, `/features`, `/pricing`, `/industries`, `/hardware`, `/contact` |
| Auth | `/sign-in`, `/sign-up`, `/onboarding` |
| Dashboard | `/dashboard` |
| Register | `/register` |
| Products | `/products`, `/products/new`, `/products/[id]` |
| Inventory | `/inventory` |
| Orders | `/orders`, `/orders/[id]` |
| Customers | `/customers`, `/customers/[id]` |
| Employees | `/employees` |
| Reports | `/reports` |
| Settings | `/settings/*` |

## API Routes

| Domain | Endpoints |
|--------|-----------|
| Auth | Clerk middleware + employee invite/PIN |
| Business | CRUD, onboarding status |
| Locations | CRUD, list |
| Products | CRUD, search, CSV import/export |
| Inventory | list, adjust, transfer, movements |
| Checkout | create order, payment intent, hold/resume |
| Stripe | Connect onboarding, webhooks, billing, terminal |
| Orders | list, detail, refund |
| Customers | CRUD, search |
| Employees | CRUD, PIN validation |
| Reports | sales, products, employees, refunds, tax |
| Settings | business, checkout, receipts, modules |

## Stripe Integration Plan

1. **Stripe Connect** – Express accounts for merchant onboarding
2. **PaymentIntents** – card-present via Terminal, card-not-present
3. **Webhooks** – `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`
4. **Stripe Billing** – SaaS plans (Starter, Pro, Multi-Location, Enterprise)
5. **Stripe Terminal** – reader registration, connection tokens, simulated reader in dev
6. **Refunds** – via Stripe API for card payments

### Payment Flow

```
Cart → Backend validates → Create Order (pending_payment)
  → Create PaymentIntent → Terminal/online payment
  → Webhook confirms → Order paid → Inventory deducted → Receipt
```

## Security Model

- Clerk for dashboard authentication
- Employee PIN (bcrypt hashed) for register access
- RBAC with granular permissions per role
- All queries scoped by `businessId`
- Zod validation on all API inputs
- Backend recalculates all order totals
- Stripe webhook signature verification
- No raw card data stored
- Audit log for sensitive actions
- Environment variables for all secrets

## Development Phases

### Phase 1: Foundation
- Prisma schema + migrations
- Clerk auth + middleware
- Marketing site
- Dashboard layout
- Business onboarding wizard

### Phase 2: Catalog
- Products, categories, variants
- Inventory management
- Customer management

### Phase 3: Checkout
- Register UI + cart store
- Order creation
- Hold/resume orders

### Phase 4: Stripe
- Connect onboarding
- PaymentIntent creation
- Webhook handler
- Terminal integration

### Phase 5: Operations
- Refunds
- Receipts
- Reports dashboard

### Phase 6: Polish
- Settings pages
- Billing/subscriptions
- Roles & permissions
- Demo seed data
- README
