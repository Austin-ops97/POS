import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/auth";
import { BuilderGateError, builderUnlockMatchesUser } from "@/lib/builder/gate";
import { recordBuilderEvent } from "@/lib/builder/service";
import { isBuilderUnlockConfigured } from "@/lib/builder/unlock-token";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) throw new BuilderGateError("Unauthorized", 401, "UNAUTHORIZED");
    if (user.platformRole !== "ADMIN") {
      await recordBuilderEvent({
        action: "ACCESS_DENIED",
        actorUserId: user.id,
        actorEmail: user.email,
        ipAddress: getClientIp(request),
        details: { code: "FORBIDDEN" },
      });
      throw new BuilderGateError("Platform administrator required", 403, "FORBIDDEN");
    }
    const configured = isBuilderUnlockConfigured();
    const unlocked = configured && (await builderUnlockMatchesUser(user.id));
    return NextResponse.json({ unlocked, configured });
  } catch (error) {
    return handleApiError(error, "GET /api/builder/session");
  }
}
