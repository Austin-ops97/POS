import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/auth";
import { recordBuilderEvent } from "./service";
import { BuilderGateError, builderGateDecision } from "./gate-decision";
import {
  BUILDER_UNLOCK_COOKIE,
  builderUnlockSecret,
  isBuilderUnlockConfigured,
  verifyBuilderUnlock,
} from "./unlock-token";

export { BuilderGateError, builderGateDecision } from "./gate-decision";

function clientIp(request?: Request) {
  if (!request) return undefined;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export async function readBuilderUnlockCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(BUILDER_UNLOCK_COOKIE)?.value ?? null;
}

export async function builderUnlockMatchesUser(userId: string): Promise<boolean> {
  const secret = builderUnlockSecret();
  if (!secret) return false;
  const token = await readBuilderUnlockCookie();
  if (!token) return false;
  return verifyBuilderUnlock(token, secret, userId);
}

export async function requireBuilder(request?: Request) {
  const user = await getAuthUser();
  const decision = builderGateDecision({
    authenticated: Boolean(user),
    isPlatformAdmin: user?.platformRole === "ADMIN",
    unlockConfigured: isBuilderUnlockConfigured(),
    unlockValid: user ? await builderUnlockMatchesUser(user.id) : false,
  });
  if (!decision.allow) {
    if (decision.code === "UNAUTHORIZED" || decision.code === "FORBIDDEN") {
      await recordBuilderEvent({
        action: "ACCESS_DENIED",
        actorUserId: user?.id,
        actorEmail: user?.email,
        ipAddress: clientIp(request),
        details: { code: decision.code },
      }).catch(() => undefined);
    }
    throw new BuilderGateError(decision.error, decision.status, decision.code);
  }
  return user!;
}
