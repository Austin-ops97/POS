import { NextResponse } from "next/server";
import { getClientIp, handleApiError } from "@/lib/api-utils";
import { getAuthUser } from "@/lib/auth";
import { BuilderGateError } from "@/lib/builder/gate";
import { clearBuilderUnlockCookie } from "@/lib/builder/session";
import { recordBuilderEvent } from "@/lib/builder/service";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) throw new BuilderGateError("Unauthorized", 401, "UNAUTHORIZED");
    if (user.platformRole !== "ADMIN") {
      throw new BuilderGateError("Platform administrator required", 403, "FORBIDDEN");
    }
    await clearBuilderUnlockCookie();
    await recordBuilderEvent({
      action: "LOCK",
      actorUserId: user.id,
      actorEmail: user.email,
      ipAddress: getClientIp(request),
      details: { reason: "lock" },
    });
    return NextResponse.json({ unlocked: false });
  } catch (error) {
    return handleApiError(error, "POST /api/builder/lock");
  }
}
