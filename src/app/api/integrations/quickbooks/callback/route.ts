import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canConnectQuickBooks } from "@/lib/import/access";
import { connectQuickBooks } from "@/lib/integrations/quickbooks-service";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const destination = new URL("/settings/integrations/quickbooks", appUrl);
  try {
    const ctx = await requireAuth();
    if (!canConnectQuickBooks(ctx)) throw new Error("Missing permission: manage_locations");
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    if (error) {
      destination.searchParams.set("error", "QuickBooks authorization was cancelled");
      return NextResponse.redirect(destination);
    }
    const code = url.searchParams.get("code");
    const realmId = url.searchParams.get("realmId");
    const state = url.searchParams.get("state");
    if (!code || !realmId || !state) throw new Error("Invalid QuickBooks: the authorization response was incomplete");
    await connectQuickBooks({ businessId: ctx.business.id, employeeId: ctx.employee.id, code, realmId, state });
    destination.searchParams.set("connected", "1");
    return NextResponse.redirect(destination);
  } catch (error) {
    destination.searchParams.set("error", error instanceof Error ? error.message : "QuickBooks connection failed");
    return NextResponse.redirect(destination);
  }
}
