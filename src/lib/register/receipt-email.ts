const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidReceiptEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return EMAIL_RE.test(trimmed);
}

export function normalizeReceiptEmail(email: string): string {
  return email.trim().toLowerCase();
}
