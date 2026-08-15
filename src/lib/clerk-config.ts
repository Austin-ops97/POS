/**
 * Clerk is only "configured" when both keys look real.
 * Dummy CI placeholders (pk_test_ci) must not enable ClerkProvider —
 * Clerk then throws "Publishable key not valid" on boot.
 */
const PUBLISHABLE_KEY_RE = /^pk_(test|live)_[A-Za-z0-9+/=_-]{20,}$/;
const SECRET_KEY_RE = /^sk_(test|live)_[A-Za-z0-9+/=_-]{20,}$/;

export function isClerkPublishableKey(value: string | undefined): boolean {
  return PUBLISHABLE_KEY_RE.test(String(value ?? "").trim());
}

export function isClerkSecretKey(value: string | undefined): boolean {
  return SECRET_KEY_RE.test(String(value ?? "").trim());
}

export function isClerkConfigured(): boolean {
  return (
    isClerkPublishableKey(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    isClerkSecretKey(process.env.CLERK_SECRET_KEY)
  );
}
