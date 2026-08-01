/** Pure join/invite predicates — safe for client and server bundles. */

export function isCallJoinableStatus(status: string): boolean {
  return status === "RINGING" || status === "ACTIVE" || status === "CREATED";
}

/** Participant may still open prejoin / get a token for an ongoing call. */
export function isParticipantJoinable(status: string): boolean {
  return (
    status === "INVITED" ||
    status === "RINGING" ||
    status === "JOINED" ||
    status === "LEFT"
  );
}

/** Invitee has not answered yet — show the incoming ring UI. */
export function isAwaitingInviteeResponse(status: string): boolean {
  return status === "INVITED" || status === "RINGING";
}

/**
 * True when this employee can still join an ongoing call returned by the active-calls API.
 * Excludes people who declined or were marked missed.
 */
export function canEmployeeJoinCall(params: {
  callStatus: string;
  participants: Array<{ employeeId: string; status: string }>;
  employeeId: string;
}): boolean {
  if (!isCallJoinableStatus(params.callStatus)) return false;
  const mine = params.participants.find((p) => p.employeeId === params.employeeId);
  if (!mine) return false;
  return isParticipantJoinable(mine.status);
}
