/**
 * Paths that skip Clerk protection.
 * `/c/:slug` is the public digital card. It must not use `/c(.*)` —
 * that pattern also matches `/customers` and `/cards`.
 */
export const PUBLIC_ROUTE_PATTERNS = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/join(.*)",
  "/api/invitations(.*)",
  "/forms(.*)",
  "/c/:slug",
  "/api/public(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/health",
] as const;
