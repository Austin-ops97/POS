import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
