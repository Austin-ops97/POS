# EmeraldOne implementation map

Phase 1 audit of the existing production app (repo package `nexapos`). This document is the handoff for phases 2–8. No new domain models were added in Phase 1. Extend the models below; do not create parallel expense, employee, receipt, project, or statement tables.

## Stack and layout

Single Next.js application. There is no monorepo, no packages workspace, and no separate mobile client.

| Layer | What is in the repo |
| --- | --- |
| App | Next.js 15 App Router, React 19, TypeScript |
| UI | Tailwind CSS 4, Radix primitives under `src/components/ui`, Lucide icons, Recharts |
| Data | PostgreSQL via Prisma 5 (`prisma/schema.prisma`, `prisma/migrations/`) |
| Auth | Clerk (`@clerk/nextjs`). Local-only bypass when Clerk is unset and `ALLOW_DEV_AUTH_BYPASS=true` outside production |
| Payments | Stripe Connect, PaymentIntents, Terminal readers, webhooks |
| Files | Vercel Blob adapter plus local receipt bytes (`src/lib/storage/`) |
| Email | Resend (receipts, project reminders, task assignment) |
| Calls | LiveKit (Connections audio/video) |
| Jobs | Vercel Cron: `/api/cron/reminders`, `/api/cron/pto-accrual` |
| State | Zustand for register cart |
| Tests | Node test runner (`npm test`), Playwright (`e2e/`) |

App routes:

- `src/app/(marketing)` — public entry (features/pricing redirect home)
- `src/app/(dashboard)` — authenticated product
- `src/app/admin` — platform control plane
- `src/app/api` — route handlers
- `src/lib` — services, auth, validations
- `src/components` — UI by domain (`dashboard`, `register`, `expenses`, `workforce`, `office`, `brand`)

The npm package name stays `nexapos`. Cookies, localStorage keys, and the `x-nexapos-module` request header stay as they are so existing sessions and drafts keep working.

## Auth and tenant isolation

1. Clerk identity maps to `User.clerkId`.
2. A person works inside a business through `EmployeeProfile` (`userId` + `businessId`). One user can belong to more than one business. `getAuthContext` prefers an invited workplace over an empty auto-provisioned shell.
3. Almost every business row carries `businessId`. Services take `AuthContext` and filter by `ctx.business.id`. Location access is a second filter for some register and inventory flows.
4. Permissions live on global `Role` / `Permission` rows (`Role.name` is globally unique, not per business). `hasPermission` grants every permission to the `Owner` role. New capabilities should be new permission keys in `src/lib/permissions.ts`, seeded through `ensureRolesAndPermissions`, and checked on the server.
5. Module licensing is `ModuleSetting` (business) plus `EmployeeModuleAccess` (employee). Middleware stamps `x-nexapos-module`; `requireAuth` rejects a disabled module. Nav hiding is not the security boundary.
6. Platform admins are Clerk emails in `PLATFORM_ADMIN_EMAILS` (`User.platformRole = ADMIN`) and use `/admin`. That plane lists businesses; it is not a tenant bypass for day-to-day APIs.

Money fields already use Prisma `Decimal` (`Decimal(12, 2)` on expenses and payments, `Decimal(10, 2)` on wages). Keep that. Do not introduce floats for stored money.

## Schema overview

Tenant root: `Business`, `Location`, `BusinessSetting`, `ModuleSetting`, `AuditLog`.

People: `User`, `Role`, `Permission`, `RolePermission`, `EmployeeProfile`, `EmployeeModuleAccess`, `EmployeeEmergencyContact`, `EmployeeCompensation`, `EmployeeLocation`.

POS: `Category`, `Product`, `ProductVariant`, `ProductBarcode`, `InventoryItem`, `InventoryMovement`, `InventoryReceipt`, `InventoryScanSession`, `ModifierGroup`, `Customer`, `Order`, `OrderItem`, `Payment`, `Refund`, `Discount`, `TaxRate`, `Receipt`, `RegisterSession`, `CashMovement`, `Signature`, `StripeAccount`, `TerminalReader`.

Workforce: `WorkforceSettings`, `Shift`, `TimeEntry`, `TimeBreak`, `TimeEntryEditRequest`, `TimeOffRequest`, `PayrollBonus`, `PtoLedgerEntry`, `SickLedgerEntry`.

Expenses: `ExpenseSettings`, `ExpenseCategory`, `ExpenseVendor`, `CompanyCard`, `CompanyCardTransaction`, `Expense`, `ExpenseReceipt`, `ExpenseLineItem`, `ExpenseTag`, `ExpenseComment`, `ExpenseApprovalEvent`, `ExpenseFlag`, `ExpenseBudget`, `ExpenseNotification`, `ExpenseAuditEvent`, `ExpenseSavedFilter`, `BankStatement`.

Office: `OfficeFolder`, `OfficeDocument`, `OfficeDocumentVersion`, `OfficeDocumentFile`, `OfficeWorkspaceRecord` (projects, tasks, spreadsheets, and other suite workspaces store JSON here), `ProjectReminder`, `ProjectAttachment`, `ProjectSubmission`, `ProjectApprovalEvent`.

Connections: `ConnectionConversation`, `ConnectionMessage`, `CommunicationCall`, `CallParticipant`.

## What already exists

| Area | Status | Where to extend |
| --- | --- | --- |
| POS / register | Exists | `src/app/(dashboard)/register`, `src/app/api/checkout`, `src/lib/register` |
| Inventory + barcode lookup | Exists | Scan sessions, Open Food Facts lookup |
| Customers | Exists | `Customer` plus register attach |
| Employees / HR profile | Partial | `EmployeeProfile` already has legal name, contact, address, DOB, hire/start dates, job, department, manager, emergency contacts, compensation history. Profile UI does not yet hide the birth year, show anniversary, or offer a vCard QR |
| Scheduling | Partial | `Shift` calendar is manual. No availability windows and no suggestion engine |
| Time clock / timesheets | Exists | PIN kiosk, edit requests, breaks, flags. Timesheet UI does not label overtime hours |
| PTO | Exists | Requests, balances, daily accrual cron, sick ledger |
| Payroll | Done for stubs and tax tracking | Period calculator, overtime, bonuses, CSV, immutable pay stubs with PDF, and effective-dated employee vs employer tax. No payroll filing or payment |
| Sale receipts | Exists | HTML, PDF, email. Branded with the **business** name, not the product name |
| Expenses | Partial | Draft through reimburse, approvals, budgets, cards, vendors, duplicate/fraud flags, keyword categorization |
| Expense receipts | Partial | `ExpenseReceipt` image/PDF, client corner detect + perspective warp (`src/lib/receipts/document-scanner.ts`), contrast enhance, regex OCR on text (`src/lib/expenses/ocr.ts`). Line items persist but the form does not edit them |
| Receipt viewer | Partial | Approval dialog shows the image. No zoom, fit, pan, or pinch |
| Expense reports | Partial | Filterable expense report with CSV/XLS/text export. No ZIP of receipt files (`jszip` is already a dependency and unused) |
| Bank statements | Partial | Uploaded statement files (`BankStatement`). Not parsed transactions |
| Card transactions | Partial | `CompanyCardTransaction` with `externalId` and source enum that already includes `PLAID`. Feeds are manual today |
| Projects | Exists | `OfficeWorkspaceRecord` workspace `projects`, reminders, attachments, completion approval. Create flow lives in Office, not on the dashboard |
| Documents | Exists | Folders, versions, scanner (color/gray/contrast, rotate, multi-page images), rich-text editor with its own zoom |
| Reporting | Partial | Sales dashboard, charts, CSV. Inventory value report. No profit-and-loss or tax packet |
| Search | Partial | Command palette over nav, products, customers, orders, documents. No OCR full text |
| Permissions / audit | Exists | RBAC plus `AuditLog` and `ExpenseAuditEvent` / `OfficeAuditEvent` |
| Background jobs | Partial | Two Vercel crons. No generic job table |
| Design system | Exists | Light slate chrome, navy `--primary` (`#1e3a5f`), success green `#10b981`. No app-wide dark theme. Marketing and platform admin use dark surfaces via an explicit wordmark tone |

## Phases 2–7

### Phase 2 — Receipts and expenses

| Feature | Status | Reuse / add |
| --- | --- | --- |
| 1. Simple vs itemized expenses | Done | `Expense.entryMode` (`SIMPLE` / `ITEMIZED`) plus line categories. Save is blocked until the user confirms a line-total discrepancy; `LINE_TOTAL_MISMATCH` is then stored on `ExpenseFlag`. No second expense table |
| 2. Receipt scanner | Done | Expense capture and the office scanner share the corner editor (detect, drag, warp, rotate, color/gray/B&W/contrast). Original JPEG is kept and a cleaned multi-page PDF is stored. OCR remains regex and is confirmed in the expense form before submit |
| 3. Receipt zoom viewer | Done | Approval dialog and office file preview use the shared viewer: zoom, fit, 100%, pan, wheel, pinch, double-tap |
| 4. Receipt search and bulk download | Done | `/finance/receipts` filters date, merchant, amount, employee, category, project, card, receipt number, location, and OCR text. ZIP via `jszip` (80 files / 30 MB) plus `receipt-index.csv`. Filenames `YYYY-MM-DD_Merchant_147.82.pdf` |

### Phase 3 — HR and scheduling

| Feature | Status | Reuse / add |
| --- | --- | --- |
| 5. Quick project from dashboard | Done | Dashboard **New Project** posts to the existing `/api/office/workspaces/projects/records` path when Office and `CREATE_DOCUMENTS` are enabled. No second project model |
| 6. HR profile expansion | Done | Existing profile fields are shown on the employee page. Directories get month/day birthday and anniversary labels. Full birth date stays on the server and is shown only with personal-info permission. Contact QR is a vCard of work contact fields |
| 7. Availability | Done | `EmployeeAvailabilityWindow` and `EmployeeAvailabilityException` are tenant-scoped. Approved `TimeOffRequest` rows block shifts. Weekly max and preferred hours live on `EmployeeProfile` |
| 8. Assisted scheduler | Done | `/workforce/schedule/assist` suggests assignments with warnings and labor cost. Publish calls the existing shift create path only after the manager confirms |
| 9. Overtime hours | Done in Phase 3 | Timesheets and payroll show regular, OT, and total hours plus pay. Rules live on `WorkforceSettings` (weekly, daily, double time, multiplier). Each payroll and timesheet calculation is stored on `OvertimeCalculation` |

### Phase 4 — Payroll

| Feature | Status | Reuse / add |
| --- | --- | --- |
| 9. Overtime hours and pay | Done for hours | Hours, pay, and configurable rules shipped with Phase 3. Pay stubs and employer tax remain Phase 4 |
| 10. Pay stubs | Done | `PayStub` and `PayStubLine` snapshot earnings, taxes, deductions, and YTD from `computePayrollSummary` plus the Phase 3 overtime result. PDF download and print read that snapshot. A processed period cannot be rewritten; void keeps the rows and drops them from YTD |
| 11. Employer payroll tax | Done | `PayrollTaxConfig` and `PayrollDeductionConfig` are effective-dated. No rates are hard-coded. Reports split employee withholding from employer tax by run, month, quarter, year, employee, and tax type |

### Phase 5 — Import and QuickBooks

| Feature | Status | Reuse / add |
| --- | --- | --- |
| 12. Data Import Center | Missing | Settings entry and a wizard. Spreadsheet CSV import inside Office is not this. Store mapping, row provenance, and a rollback batch. No live QuickBooks calls in the wizard until OAuth exists |
| 13. QuickBooks architecture | Missing | Official OAuth and APIs only. External ids, sync status, and logs on a connection record. No scraping and no writes until the user connects a real app |

### Phase 6 — Banking and accounting

| Feature | Status | Reuse / add |
| --- | --- | --- |
| 16. Bank connection | Missing | `CardTransactionSource.PLAID` is only an enum value. Add a tokenized link (Plaid or equivalent). Never store bank passwords |
| 17. Transaction center | Partial | Categorize and split on top of `CompanyCardTransaction` or a sibling bank-transaction row that can point at `Expense`, `ExpenseReceipt`, project, and vendor. Do not duplicate `Expense` |
| 18–20. P&L, charts, tax-ready expenses | Partial | Sales and expense reports/charts exist separately. A P&L should compose paid orders and approved expenses. Tax-ready export should reuse expense categories and receipt files |
| 21. Statement import fallback | Partial | `BankStatement` already stores the file. Parsing into transactions is new and must stay optional next to a live bank link |
| 22. Categorization | Partial | `src/lib/expenses/constants.ts` keyword map and fraud flags. Extend that; do not add a second rules engine |
| 23. Document associations | Partial | Office files and expense receipts are separate. Association should be a link table, not a copy of `OfficeDocument` or `ExpenseReceipt` |

### Phase 7 — Social

| Feature | Status | Reuse / add |
| --- | --- | --- |
| 14. Social connection center | Missing | OAuth for Facebook, Instagram, and LinkedIn. Reconnect and disconnect. Store tokens server-side only |
| 15. Post composer | Missing | Multi-destination publish with partial failure and an audit row. Depends on feature 14. Connections messaging is internal staff chat, not social publishing |

Phase 8 (search, dashboard actions, overview cards, audit, permissions, jobs, responsive polish) is mostly partial on top of the systems above. Global search, dashboard stat cards, audit logs, and RBAC already exist and should be extended rather than replaced.

## Migration strategy

- One shared Postgres database. Every new table gets `businessId`, a foreign key to `Business`, and indexes that start with `businessId`.
- Add columns and enum values with Prisma migrations (`npm run db:migrate` locally, `db:deploy` in production). Do not `db push` against production.
- Phase 2 added `Expense.entryMode`, receipt fields, line-item categories, `ExpenseReceipt.role`, and `ExpenseFlagType.LINE_TOTAL_MISMATCH`. The enum value is its own migration so Postgres can commit `ADD VALUE` before the column migration. Viewer zoom state stays in the browser.
- Phase 3 added availability windows and exceptions, overtime rule columns, max/preferred hours, and `OvertimeCalculation` snapshots. Suggestions are not stored; published shifts are normal `Shift` rows.
- Phase 4 added `PayrollRun`, `PayStub`, `PayStubLine`, `PayrollTaxConfig`, and `PayrollDeductionConfig`, plus `WorkforceSettings.employerReference`. One processed run per business and period is enforced with a partial unique index. Voided runs remain in the table. Stubs do not reuse mutable `PayrollBonus` rows; bonuses are copied into the snapshot at process time.
- Bank and accounting links should reference `Expense`, `ExpenseReceipt`, `OfficeDocument`, and `OfficeWorkspaceRecord` by id.
- Roles stay global. Adding permissions is an upsert in `ensureRolesAndPermissions`, not a per-business role clone.
- Backfill nothing that rewrites historical pay or posted expenses.

## Risks

- `Role.name` is globally unique. A permission change affects every business using that system role.
- Owner short-circuit in `hasPermission` skips the permission list. New sensitive reads (tax, bank tokens, full birth date) still need explicit checks for non-owners and should not leak through Owner-only UI assumptions on the client.
- Queries that forget `businessId` cross tenants. Follow existing service functions instead of new ad hoc Prisma calls.
- Receipt and statement bytes can contain card numbers. Keep storage server-side; the browser should receive authorized file routes, not raw storage credentials.
- Renaming cookies (`nexapos_register_cashier`) or draft keys would sign cashiers out and drop unsaved office drafts. Leave them.
- Sentry service name is now `emeraldone`. Older events were tagged `nexapos`.
- Email “from” display names in production come from `RECEIPTS_FROM_EMAIL` and `OFFICE_FROM_EMAIL`, which are already set in the host. `.env.example` shows EmeraldOne; updating live sender names is an environment change, not a migration.
- Reminder email chrome says **Emerald Vale Studios** (the company). That is not the product name and was left in place.
- Sale receipts and receipt emails use the merchant business name. They were not rewritten with the product wordmark.
- There is no class-based dark theme. The wordmark uses `on-light` (near-black + emerald-700) on app chrome and `on-dark` (white + emerald-400) on the marketing page and platform admin bar. Do not flip those colors with `prefers-color-scheme`, or the light sidebar would render white text.

## Credentials to collect later

Phase 1 does not block on these. Do not invent buttons that pretend they are connected. Stripe, Clerk, Resend, and LiveKit are already the live integrations.

| Later phase | What the user must provide |
| --- | --- |
| QuickBooks | Intuit app client id, client secret, redirect URI, and the realm/company to link. Official OAuth only |
| Bank link | Plaid (or the chosen provider) client id, secret, and environment (sandbox vs production). No bank passwords in EmeraldOne |
| Social | Meta app id/secret for Facebook and Instagram, LinkedIn client id/secret, and the OAuth redirect URLs for each |

Already required for the current app, unchanged by this phase: `DATABASE_URL`, `DIRECT_URL`, Clerk keys, Stripe keys, `PLATFORM_ADMIN_EMAILS`. Optional and already wired: Resend, LiveKit, Vercel Blob, Sentry, Upstash Redis, cron secret.
