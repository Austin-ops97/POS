import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";
import { isDemoMode } from "./demo-mode";
import { demoAuthContext } from "./demo-data";
import type { EmployeeProfile, Business, Location } from "@prisma/client";

const SINGLE_USER_CLERK_ID = "single-user-pos";
const SINGLE_USER_EMAIL = "owner@pos.local";

export type AuthContext = {
  clerkId: string;
  userId: string;
  email: string;
  employee: EmployeeProfile & {
    role: { name: string; permissions: { permission: { key: string } }[] };
    locations: { locationId: string; location: Location }[];
    business: Business;
  };
  business: Business;
  location: Location | null;
};

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
      process.env.CLERK_SECRET_KEY
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
    },
    update: {},
  });
}

export async function getAuthUser() {
  if (isDemoMode()) return null;
  if (!isClerkConfigured()) return getSingleUser();

  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const user = await db.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      email: clerkUser.emailAddresses[0]?.emailAddress || "",
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
    update: {
      email: clerkUser.emailAddresses[0]?.emailAddress || "",
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      imageUrl: clerkUser.imageUrl,
    },
  });

  return user;
}

export async function getAuthContext(businessId?: string): Promise<AuthContext | null> {
  if (isDemoMode()) {
    return demoAuthContext;
  }

  const user = await getAuthUser();
  if (!user) return null;

  const employee = await db.employeeProfile.findFirst({
    where: {
      ...(isClerkConfigured() ? { userId: user.id } : {}),
      ...(businessId ? { businessId } : {}),
      status: "ACTIVE",
      deletedAt: null,
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
    orderBy: { createdAt: "asc" },
  });

  if (!employee) return null;

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
  return ctx;
}

export function hasPermission(
  ctx: AuthContext,
  permission: string
): boolean {
  if (isDemoMode()) return true;
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
