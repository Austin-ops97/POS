import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { db } from "./db";
import { isClerkConfigured } from "./clerk-config";
import type { EmployeeProfile, Business, Location } from "@prisma/client";

export { isClerkConfigured };

const SINGLE_USER_CLERK_ID = "single-user-pos";
const SINGLE_USER_EMAIL = "owner@pos.local";

function platformAdminEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export type AuthContext = {
  clerkId: string;
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  employee: EmployeeProfile & {
    role: { name: string; permissions: { permission: { key: string } }[] };
    locations: { locationId: string; location: Location }[];
    business: Business;
  };
  business: Business;
  location: Location | null;
};

/**
 * Local single-user auth is only allowed when Clerk is unset AND
 * ALLOW_DEV_AUTH_BYPASS=true AND we are not in production.
 */
export function allowDevAuthBypass(): boolean {
  return (
    !isClerkConfigured() &&
    process.env.ALLOW_DEV_AUTH_BYPASS === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

async function getSingleUser() {
  return db.user.upsert({
    where: { clerkId: SINGLE_USER_CLERK_ID },
    create: {
      clerkId: SINGLE_USER_CLERK_ID,
      email: SINGLE_USER_EMAIL,
      firstName: "POS",
      lastName: "Owner",
      platformRole: platformAdminEmails().has(SINGLE_USER_EMAIL) ? "ADMIN" : "USER",
    },
    update: {
      platformRole: platformAdminEmails().has(SINGLE_USER_EMAIL) ? "ADMIN" : undefined,
    },
  });
}

export async function getAuthUser() {
  if (!isClerkConfigured()) {
    if (!allowDevAuthBypass()) return null;
    return getSingleUser();
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ||
    clerkUser.emailAddresses.find((item) => item.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    "";
  const platformRole = platformAdminEmails().has(email.toLowerCase()) ? "ADMIN" : undefined;
  const user = await db.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      email,
      platformRole,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
    update: {
      email,
      ...(platformRole ? { platformRole } : {}),
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
  });

  return user;
}

export async function getAuthContext(businessId?: string): Promise<AuthContext | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const { findPreferredActiveMembership } = await import("./membership");

  // When no explicit business is requested, prefer the shared/invited workplace
  // over an empty auto-provisioned "My Business" shell.
  const preferred =
    !businessId && (isClerkConfigured() || !allowDevAuthBypass())
      ? await findPreferredActiveMembership(user.id)
      : null;

  const employee = await db.employeeProfile.findFirst({
    where: {
      // Always scope to the authenticated user when Clerk is on.
      // Dev bypass still picks an ACTIVE employee for local single-user mode.
      ...(isClerkConfigured() || !allowDevAuthBypass()
        ? { userId: user.id }
        : {}),
      ...(businessId
        ? { businessId }
        : preferred
          ? { id: preferred.id }
          : {}),
      status: "ACTIVE",
      deletedAt: null,
      business: { status: "ACTIVE", deletedAt: null },
    },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
      business: true,
      locations: {
        include: { location: true },
      },
    },
    orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
  });

  if (!employee) return null;
  if (employee.business.status !== "ACTIVE") return null;

  const defaultLocation =
    employee.locations.find((el) => el.location.isDefault)?.location ||
    employee.locations[0]?.location ||
    (await db.location.findFirst({
      where: { businessId: employee.businessId, isActive: true },
    }));

  return {
    clerkId: user.clerkId,
    userId: user.id,
    email: user.email,
    isPlatformAdmin: user.platformRole === "ADMIN",
    employee,
    business: employee.business,
    location: defaultLocation,
  };
}

export async function requireAuth(businessId?: string): Promise<AuthContext> {
  const ctx = await getAuthContext(businessId);
  if (!ctx) {
    throw new Error("Unauthorized");
  }
  const requestedModule = (await headers()).get("x-nexapos-module");
  if (requestedModule) {
    const [businessSetting, employeeSetting] = await Promise.all([
      db.moduleSetting.findUnique({
        where: { businessId_module: { businessId: ctx.business.id, module: requestedModule } },
        select: { enabled: true },
      }),
      db.employeeModuleAccess.findUnique({
        where: { employeeId_module: { employeeId: ctx.employee.id, module: requestedModule } },
        select: { enabled: true },
      }),
    ]);
    if (businessSetting?.enabled === false || employeeSetting?.enabled === false) {
      throw new Error(`Module disabled: ${requestedModule}`);
    }
  }
  return ctx;
}

export async function requirePlatformAdmin() {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthorized");
  if (user.platformRole !== "ADMIN") throw new Error("Platform administrator required");
  return user;
}

export function hasPermission(
  ctx: AuthContext,
  permission: string
): boolean {
  if (ctx.employee.role.name === "Owner") return true;
  return ctx.employee.role.permissions.some(
    (rp) => rp.permission.key === permission
  );
}

export async function requirePermission(
  ctx: AuthContext,
  permission: string
): Promise<void> {
  if (!hasPermission(ctx, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

export function hasAnyPermission(
  ctx: AuthContext,
  permissions: string[]
): boolean {
  return permissions.some((permission) => hasPermission(ctx, permission));
}

export async function requireAnyPermission(
  ctx: AuthContext,
  permissions: string[]
): Promise<void> {
  if (!hasAnyPermission(ctx, permissions)) {
    throw new Error(`Missing permission: ${permissions.join(" | ")}`);
  }
}
