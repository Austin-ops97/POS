# EmeraldOne Builder

Austin (and any other email in `PLATFORM_ADMIN_EMAILS`) uses Builder to onboard a business onto EmeraldOne. Business owners, managers, and cashiers do not have a link to it, and the server rejects them if they request it.

Builder lives at `/admin/builder`. The older `/admin` business list can still suspend an account. Feature licensing is changed only in Builder.

## Access

Both checks run on every Builder mutation and read except the unlock form itself:

1. The signed-in user must already be a platform admin (`User.platformRole = ADMIN`, set from `PLATFORM_ADMIN_EMAILS` in `getAuthUser`).
2. The browser must present an httpOnly cookie, `e1_builder_unlock`, signed with `BUILDER_UNLOCK_SECRET`. The cookie stores the admin user id and an expiry. It does not store the secret.

Unlock lasts 8 hours. **Lock Builder** clears the cookie. A wrong secret returns `Unlock failed.` Five attempts in 15 minutes return `Too many unlock attempts. Try again later.` Failures are written to `BuilderAuditEvent` with a reason such as `mismatch` or `rate_limited`. The submitted secret is never stored.

`BUILDER_UNLOCK_SECRET` must be at least 16 characters. If it is missing or shorter, Builder stays locked.

## One-time host checklist

Set these in Vercel (or the local `.env`) once. Changing them still needs a redeploy. Builder does not edit them and does not display their values.

| Variable | Role |
| --- | --- |
| `PLATFORM_ADMIN_EMAILS` | Who may open `/admin` and `/admin/builder` |
| `BUILDER_UNLOCK_SECRET` | Second gate for Builder. At least 16 characters. Do not prefix it with `NEXT_PUBLIC_` |
| `CREDENTIALS_ENCRYPTION_KEY` | Master key for the platform credential vault. 32 bytes, base64 (`openssl rand -base64 32`). This encrypts Meta, LinkedIn, Plaid, and Intuit app secrets at rest |
| `DATABASE_URL`, `DIRECT_URL` | Database |
| Clerk keys | Sign-in. Status only inside Builder |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_CONNECT_CLIENT_ID` | Platform Stripe |
| `RESEND_API_KEY` | Email |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` | Video calls |
| `BLOB_READ_WRITE_TOKEN` | Project photos and Instagram image URLs |
| `NEXT_PUBLIC_APP_URL` | Used to suggest OAuth redirect URIs |

Do not put Meta, LinkedIn, Plaid, or Intuit app secrets in Vercel as the ongoing place to edit them. Save those in Builder. If a host variable is still set, the app uses it only when the vault does not have that key.

## Platform credential vault

Builder → **Platform credentials** stores the app-level keys for Meta (Facebook and Instagram), LinkedIn, Plaid, and Intuit QuickBooks. Each value is AES-256-GCM ciphertext in `PlatformCredential`, encrypted with `CREDENTIALS_ENCRYPTION_KEY`. The screen shows configured or not, last updated, a last-4 hint for secrets, the redirect URI, and sandbox or production. It never returns the secret itself.

On the first save for a provider, EmeraldOne generates that provider's user-token encryption key (`SOCIAL_TOKEN_ENCRYPTION_KEY`, `PLAID_TOKEN_ENCRYPTION_KEY`, or `INTUIT_TOKEN_ENCRYPTION_KEY`) and stores it in the vault when the host does not already have a valid 32-byte key. Clearing a provider removes the app id, secret, redirect, and environment. It leaves the token encryption key so connections that are already saved can still be opened.

Redirect URIs must end with the callback the provider app whitelists:

| Provider | Callback path |
| --- | --- |
| Meta | `/api/integrations/meta/callback` |
| LinkedIn | `/api/integrations/linkedin/callback` |
| Intuit | `/api/integrations/quickbooks/callback` |

If `NEXT_PUBLIC_APP_URL` is set, Builder suggests `origin + that path`.

`getPlatformCredential(name)` reads the vault first and falls back to `process.env`. Social connect, Plaid Link, and QuickBooks OAuth use that helper, so saving in Builder turns on Connect without a redeploy. Per-business Page, bank, and company links stay where they are today. This vault is only the platform app keys.

Vault writes are `PLATFORM_CREDENTIALS_SET` and `PLATFORM_CREDENTIALS_CLEAR` on `BuilderAuditEvent`: actor, time, provider, and key names. The submitted secret is not stored in the audit row.

Tenant users cannot open `/admin/builder` or `/api/builder/credentials`. Both still require a platform admin and the unlock cookie.

Builder still shows Stripe, Clerk, Resend, LiveKit, blob storage, and the vault-backed providers as status. It does not reveal secret values.

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

Connection rows show Connected, Not connected, Needs credentials, or Error. QuickBooks, Plaid, and social passwords are not collected here, and decrypted tokens are not selected or returned. Platform app keys are edited on Platform credentials, not on the per-business connection rows.
