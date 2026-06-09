import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "./db";
import type { EmployeeProfile, Business, Location } from "@prisma/client";

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

export async function getAuthUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  let user = await db.user.findUnique({ where: { clerkId } });

  if (!user) {
    user = await db.user.create({
      data: {
        clerkId,
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
      },
    });
  }

  return user;
}

export async function getAuthContext(businessId?: string): Promise<AuthContext | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const employee = await db.employeeProfile.findFirst({
    where: {
      userId: user.id,
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
