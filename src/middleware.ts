import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/clerk-config";
import { moduleForPath } from "@/lib/module-routes";
import { PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";

function forwardedRequest(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const appModule = moduleForPath(request.nextUrl.pathname);
  if (appModule) requestHeaders.set("x-nexapos-module", appModule);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTE_PATTERNS]);

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
