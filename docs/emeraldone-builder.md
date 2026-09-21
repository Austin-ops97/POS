# EmeraldOne Builder

Austin (and any other email in `PLATFORM_ADMIN_EMAILS`) uses Builder to onboard a business onto EmeraldOne. Business owners, managers, and cashiers do not have a link to it, and the server rejects them if they request it.

Builder lives at `/admin/builder`. The older `/admin` business list can still suspend an account. Feature licensing is changed only in Builder.

## Access

Both checks run on every Builder mutation and read except the unlock form itself:

1. The signed-in user must already be a platform admin (`User.platformRole = ADMIN`, set from `PLATFORM_ADMIN_EMAILS` in `getAuthUser`).
2. The browser must present an httpOnly cookie, `e1_builder_unlock`, signed with `BUILDER_UNLOCK_SECRET`. The cookie stores the admin user id and an expiry. It does not store the secret.

Unlock lasts 8 hours. **Lock Builder** clears the cookie. A wrong secret returns `Unlock failed.` Five attempts in 15 minutes return `Too many unlock attempts. Try again later.` Failures are written to `BuilderAuditEvent` with a reason such as `mismatch` or `rate_limited`. The submitted secret is never stored.

`BUILDER_UNLOCK_SECRET` must be at least 16 characters. If it is missing or shorter, Builder stays locked.

## Env checklist

Set these in the host environment. Builder shows whether each one is present. It does not edit them and it does not display the values.

| Variable | Role |
| --- | --- |
| `PLATFORM_ADMIN_EMAILS` | Who may open `/admin` and `/admin/builder` |
| `BUILDER_UNLOCK_SECRET` | Second gate for Builder |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_CLIENT_ID` | Platform Stripe |
| `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET`, `INTUIT_REDIRECT_URI`, `INTUIT_TOKEN_ENCRYPTION_KEY` | QuickBooks app |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_TOKEN_ENCRYPTION_KEY` | Plaid app |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Facebook and Instagram app |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | LinkedIn app |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | Encrypts social OAuth tokens |
| `RESEND_API_KEY` | Email |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` | Video calls |
| `BLOB_READ_WRITE_TOKEN` | Project photos and Instagram images |

Clerk keys are status-only. Do not prefix `BUILDER_UNLOCK_SECRET` with `NEXT_PUBLIC_`.

## Plans and features

Feature on/off is still `ModuleSetting` (`businessId` + `module`). Builder does not add a second flag table.

| Plan | Turns on |
| --- | --- |
| Starter | Register, payments, catalog, inventory, orders, customers |
| Pro | Starter plus workforce, scheduling, expenses, office, projects, reports, connections, banking, accounting reports, import |
| Enterprise | Every shipped module, including payroll, QuickBooks, and social publishing |

Unshipped verticals (service, rental, restaurant, loyalty, gift cards) stay off in every preset. After a plan is applied, any single feature can be switched. That business is then marked as having overrides.

Applying a plan writes an explicit row for every module key. Modules that are not in the plan are set to off.

## Existing businesses

The migration does not rewrite `ModuleSetting`. A missing row is treated as enabled, which is how Emerald Vale keeps the modules it already uses. New keys such as `PAYROLL`, `BANKING`, `ACCOUNTING`, `SOCIAL`, `IMPORT`, `QUICKBOOKS`, `PROJECTS`, and `SCHEDULING` stay on until someone applies a plan or turns that feature off.

New businesses created from the product signup path still use `defaultEnabledModules()` (shipped modules on, unshipped verticals off). Businesses created in Builder start on the plan you pick.

## Enforcement

Middleware stamps `x-nexapos-module` from the request path, including the more specific payroll, scheduling, banking, accounting, import, QuickBooks, social, and projects paths. `requireAuth` calls `enforceBusinessModule`. A row with `enabled: false` returns `Module disabled`. Navigation hides the same modules, but hiding a link is not the security check.

Disabled payroll routes stay blocked even when workforce is still on, and the reverse is also true.

## Onboarding

The checklist on a business records: business created, plan applied, features reviewed, integrations confirmed, owner invited. Creating a business with an owner email returns a join link once. That link is not written to the audit log.

Connection rows show Connected, Not connected, Needs credentials, or Error. QuickBooks, Plaid, and social passwords are not collected here, and decrypted tokens are not selected or returned.
