import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function invitationEmailMatches(inviteEmail: string, candidateEmails: string[]) {
  const target = normalizeEmail(inviteEmail);
  return candidateEmails.some((email) => email && normalizeEmail(email) === target);
}

/** Only allow in-app relative paths so invitation redirects cannot leave the site. */
export function safeAppRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (value.startsWith("/\\") || /^\/[a-z]+:/i.test(value)) return null;
  return value;
}
