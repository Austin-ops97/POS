import { Prisma } from "@prisma/client";
import { db } from "./db";
import { getAuthUser, type AuthContext } from "./auth";
import { ensureRolesAndPermissions } from "./roles-permissions";
import { defaultEnabledModules, CANONICAL_MODULE_KEYS } from "./modules";

export type ProvisionUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type ProvisionedBusinessContext = {
  businessId: string;
  locationId: string;
  employeeId: string;
  created: boolean;
};

const DEFAULT_BUSINESS_NAME = "My Business";
const DEFAULT_LOCATION_NAME = "Main Location";
const DEFAULT_PRIMARY_COLOR = "#1e3a5f";
const DEFAULT_TIMEZONE = "America/Chicago";

async function findActiveEmployeeForUser(userId: string) {
  return db.employeeProfile.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      deletedAt: null,
    },
    include: {
      locations: { take: 1, orderBy: { locationId: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Idempotent provisioning for a local User row.
 * Existing employees keep their business; new users get a blank unlocked business.
 * Safe under concurrent requests via serializable transactions + conflict handling.
 */
export async function provisionBusinessForLocalUser(
  user: ProvisionUser
): Promise<ProvisionedBusinessContext> {
  const existing = await findActiveEmployeeForUser(user.id);
  if (existing) {
    return {
      businessId: existing.businessId,
      locationId: existing.defaultLocationId ?? existing.locations[0]?.locationId ?? "",
      employeeId: existing.id,
      created: false,
    };
  }

  const roleIds = await ensureRolesAndPermissions(db);
  const ownerRoleId = roleIds["Owner"];
  if (!ownerRoleId) {
    throw new Error("Owner role could not be created");
  }

  const ownerName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  try {
    return await db.$transaction(
      async (tx) => {
        const raced = await tx.employeeProfile.findFirst({
          where: {
            userId: user.id,
            status: "ACTIVE",
            deletedAt: null,
          },
          include: {
            locations: { take: 1, orderBy: { locationId: "asc" } },
          },
        });

        if (raced) {
          return {
            businessId: raced.businessId,
            locationId:
              raced.defaultLocationId ?? raced.locations[0]?.locationId ?? "",
            employeeId: raced.id,
            created: false,
          };
        }

        const business = await tx.business.create({
          data: {
            name: DEFAULT_BUSINESS_NAME,
            type: "HYBRID",
            email: user.email,
            primaryColor: DEFAULT_PRIMARY_COLOR,
          },
        });

        const location = await tx.location.create({
          data: {
            businessId: business.id,
            name: DEFAULT_LOCATION_NAME,
            country: "US",
            timezone: DEFAULT_TIMEZONE,
            isActive: true,
            isDefault: true,
          },
        });

        await tx.businessSetting.create({
          data: {
            businessId: business.id,
            enableCash: true,
            enableCard: true,
            enableManualDiscount: true,
            allowCustomItems: true,
            enableBarcodeScanning: true,
            enableReceiptPrinting: true,
            requireCustomer: false,
            requirePinAtRegister: false,
          },
        });

        await tx.workforceSettings.create({
          data: { businessId: business.id },
        });

        await tx.moduleSetting.createMany({
          data: defaultEnabledModules().map((setting) => ({
            businessId: business.id,
            module: setting.module,
            enabled: setting.enabled,
          })),
        });

        await tx.stripeAccount.create({
          data: {
            businessId: business.id,
            status: "NOT_CONNECTED",
          },
        });

        await tx.taxRate.create({
          data: {
            businessId: business.id,
            locationId: location.id,
            name: "Sales Tax",
            rate: 0,
            appliesToProducts: true,
            appliesToServices: true,
            isActive: true,
          },
        });

        const employee = await tx.employeeProfile.create({
          data: {
            businessId: business.id,
            userId: user.id,
            roleId: ownerRoleId,
            name: ownerName,
            email: user.email,
            status: "ACTIVE",
            defaultLocationId: location.id,
          },
        });

        await tx.employeeLocation.create({
          data: {
            employeeId: employee.id,
            locationId: location.id,
          },
        });

        return {
          businessId: business.id,
          locationId: location.id,
          employeeId: employee.id,
          created: true,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      const winner = await findActiveEmployeeForUser(user.id);
      if (winner) {
        return {
          businessId: winner.businessId,
          locationId:
            winner.defaultLocationId ?? winner.locations[0]?.locationId ?? "",
          employeeId: winner.id,
          created: false,
        };
      }
    }
    throw error;
  }
}

/**
 * Idempotent first-login provisioning for the authenticated Clerk (or single-user) account.
 */
export async function ensureProvisionedBusinessForUser(): Promise<ProvisionedBusinessContext | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return provisionBusinessForLocalUser(user);
}

/**
 * Ensures the current user has a provisioned business, then returns auth context.
 */
export async function requireProvisionedAuth(): Promise<AuthContext> {
  const provisioned = await ensureProvisionedBusinessForUser();
  if (!provisioned) {
    throw new Error("Unauthorized");
  }

  const { getAuthContext } = await import("./auth");
  const ctx = await getAuthContext(provisioned.businessId);
  if (!ctx) {
    throw new Error("Unauthorized");
  }
  return ctx;
}

export { CANONICAL_MODULE_KEYS };
