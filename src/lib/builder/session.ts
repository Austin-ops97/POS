import { cookies } from "next/headers";
import {
  BUILDER_UNLOCK_COOKIE,
  builderUnlockSecret,
  signBuilderUnlock,
} from "./unlock-token";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function setBuilderUnlockCookie(userId: string) {
  const secret = builderUnlockSecret();
  if (!secret) {
    throw new Error("Builder unlock is not configured");
  }
  const { value, maxAge } = signBuilderUnlock(userId, secret);
  const jar = await cookies();
  jar.set(BUILDER_UNLOCK_COOKIE, value, cookieOptions(maxAge));
}

export async function clearBuilderUnlockCookie() {
  const jar = await cookies();
  jar.set(BUILDER_UNLOCK_COOKIE, "", cookieOptions(0));
}
