/** Timeline messages use this prefix so the inbox can style them as system events. */
export const CALL_SYSTEM_PREFIX = "__CALL__:";

export function isCallSystemMessage(body: string): boolean {
  return body.startsWith(CALL_SYSTEM_PREFIX);
}

export function callSystemBody(text: string): string {
  return `${CALL_SYSTEM_PREFIX}${text}`;
}

export function stripCallSystemPrefix(body: string): string {
  return isCallSystemMessage(body) ? body.slice(CALL_SYSTEM_PREFIX.length) : body;
}
