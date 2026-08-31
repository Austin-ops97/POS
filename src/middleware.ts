import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/clerk-config";

function moduleForPath(pathname: string): string | null {
  const routes: Array<[string, string]> = [
    ["/api/checkout", "POS"], ["/register", "POS"],
    ["/api/stripe", "PAYMENTS"], ["/payments", "PAYMENTS"],
    ["/api/products", "CATALOG"], ["/products", "CATALOG"],
    ["/api/inventory", "INVENTORY"], ["/inventory", "INVENTORY"],
    ["/api/orders", "ORDERS"], ["/orders", "ORDERS"],
    ["/api/customers", "CUSTOMERS"], ["/customers", "CUSTOMERS"],
    ["/api/reports", "REPORTS"], ["/reports", "REPORTS"],
    ["/api/employees", "WORKFORCE"], ["/api/workforce", "WORKFORCE"],
    ["/employees", "WORKFORCE"], ["/workforce", "WORKFORCE"],
    ["/api/connections", "CONNECTIONS"], ["/connections", "CONNECTIONS"],
    ["/api/expenses", "EXPENSES"], ["/finance", "EXPENSES"],
    ["/api/office", "OFFICE"], ["/office", "OFFICE"],
  ];
  return routes.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || null;
}

function forwardedRequest(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const appModule = moduleForPath(request.nextUrl.pathname);
  if (appModule) requestHeaders.set("x-nexapos-module", appModule);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/join(.*)",
  "/api/invitations(.*)",
  "/forms(.*)",
  "/api/public(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/health",
]);

function allowDevAuthBypass() {
  return (
    !isClerkConfigured() &&
    process.env.ALLOW_DEV_AUTH_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

const clerkAuthMiddleware = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
  return forwardedRequest(request);
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!isClerkConfigured()) {
    // Fail closed unless an explicit local-only bypass is enabled.
    if (!allowDevAuthBypass() && !isPublicRoute(request)) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error:
              "Authentication is not configured. Set Clerk keys or ALLOW_DEV_AUTH_BYPASS=true for local development.",
          },
          { status: 503 }
        );
      }
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
    return forwardedRequest(request);
  }

  return clerkAuthMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
