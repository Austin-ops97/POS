import { randomBytes } from "crypto";
export {
  CALL_SYSTEM_PREFIX,
  callSystemBody,
  isCallSystemMessage,
  stripCallSystemPrefix,
} from "./call-markers";
export {
  canEmployeeJoinCall,
  isAwaitingInviteeResponse,
  isCallJoinableStatus,
  isParticipantJoinable,
} from "./call-join";

export const DEFAULT_RING_TIMEOUT_MS = 45_000;

export function buildProviderRoomName(businessId: string, conversationId: string): string {
  const nonce = randomBytes(6).toString("hex");
  return `nx_${businessId.slice(0, 12)}_${conversationId.slice(0, 12)}_${nonce}`;
}

export function formatCallDuration(startedAt: Date, endedAt: Date): string {
  const totalSeconds = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return "less than a minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

export function isGroupOrEveryoneConversation(type: string): boolean {
  return type === "GROUP" || type === "EVERYONE";
}

export function canEndCallAs(params: { isHost: boolean; canModerate: boolean }): boolean {
  return params.isHost || params.canModerate;
}

/** Cross-tenant access must look like a missing call (no leak). */
export function assertCallTenant(callBusinessId: string, ctxBusinessId: string): void {
  if (callBusinessId !== ctxBusinessId) {
    throw new Error("Call not found");
  }
}

export function ringingHasTimedOut(
  ringingAt: Date | null | undefined,
  now: Date = new Date(),
  timeoutMs: number = DEFAULT_RING_TIMEOUT_MS
): boolean {
  if (!ringingAt) return false;
  return now.getTime() - ringingAt.getTime() >= timeoutMs;
}
