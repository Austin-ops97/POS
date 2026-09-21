import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/auth";
import { BuilderGateError } from "@/lib/builder/gate";
import { setBuilderUnlockCookie } from "@/lib/builder/session";
import { recordBuilderEvent } from "@/lib/builder/service";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import {
  builderUnlockSecret,
  secretsMatch,
  unlockFailureMessage,
} from "@/lib/builder/unlock-token";

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 5;

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    const ipAddress = getClientIp(request);
    if (!user) {
      await recordBuilderEvent({ action: "ACCESS_DENIED", ipAddress, details: { code: "UNAUTHORIZED" } });
      throw new BuilderGateError("Unauthorized", 401, "UNAUTHORIZED");
    }
    if (user.platformRole !== "ADMIN") {
      await recordBuilderEvent({
        action: "ACCESS_DENIED",
        actorUserId: user.id,
        actorEmail: user.email,
        ipAddress,
        details: { code: "FORBIDDEN" },
      });
      throw new BuilderGateError("Platform administrator required", 403, "FORBIDDEN");
    }

    const actor = { actorUserId: user.id, actorEmail: user.email, ipAddress };
    const configured = builderUnlockSecret();
    if (!configured) {
      const message = unlockFailureMessage("unconfigured");
      await recordBuilderEvent({ ...actor, action: "UNLOCK_FAILURE", details: { reason: "unconfigured" } });
      return NextResponse.json({ error: message.error, code: message.code }, { status: message.status });
    }

    const limit = await checkRateLimitAsync(`builder-unlock:${user.id}:${ipAddress || "unknown"}`, LIMIT, WINDOW_MS);
    if (!limit.ok) {
      const message = unlockFailureMessage("rate_limited");
      await recordBuilderEvent({ ...actor, action: "UNLOCK_FAILURE", details: { reason: "rate_limited" } });
      return NextResponse.json({ error: message.error, code: message.code }, { status: message.status });
    }

    let provided = "";
    try {
      const body: unknown = await request.json();
      if (body && typeof body === "object" && "secret" in body && typeof body.secret === "string") {
        provided = body.secret;
      }
    } catch {
      provided = "";
    }

    if (!secretsMatch(provided, configured)) {
      const message = unlockFailureMessage("mismatch");
      await recordBuilderEvent({ ...actor, action: "UNLOCK_FAILURE", details: { reason: "mismatch" } });
      return NextResponse.json({ error: message.error, code: message.code }, { status: message.status });
    }

    await setBuilderUnlockCookie(user.id);
    await recordBuilderEvent({ ...actor, action: "UNLOCK_SUCCESS", details: { reason: "ok" } });
    return NextResponse.json({ unlocked: true });
  } catch (error) {
    return handleApiError(error, "POST /api/builder/unlock");
  }
}
