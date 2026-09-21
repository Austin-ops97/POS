import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canManageSocial } from "@/lib/social/access";
import { connectMeta } from "@/lib/social/social-service";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const destination = new URL("/settings/integrations/social", appUrl);
  try {
    const ctx = await requireAuth();
    if (!canManageSocial(ctx)) throw new Error("Missing permission: manage_locations");
    const url = new URL(request.url);
    if (url.searchParams.get("error")) {
      destination.searchParams.set("error", "Meta authorization was cancelled");
      return NextResponse.redirect(destination);
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) throw new Error("Invalid social: the authorization response was incomplete");
    await connectMeta(ctx, { code, state });
    destination.searchParams.set("connected", "meta");
    return NextResponse.redirect(destination);
  } catch (error) {
    destination.searchParams.set("error", error instanceof Error ? error.message : "Meta connection failed");
    return NextResponse.redirect(destination);
  }
}
