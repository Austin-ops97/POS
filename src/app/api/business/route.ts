import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser, requireAuth } from "@/lib/auth";
import { createBusinessSchema, posConfigSchema } from "@/lib/validations";
import { ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { STRIPE_PLANS } from "@/lib/stripe";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

function formatPermissionName(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function ensureRolesAndPermissions() {
  const permissionIds: Record<string, string> = {};

  for (const key of Object.values(PERMISSIONS)) {
    const permission = await db.permission.upsert({
      where: { key },
      create: {
        key,
        name: formatPermissionName(key),
        description: `Permission: ${key}`,
      },
      update: {},
    });
    permissionIds[key] = permission.id;
  }

  const roleIds: Record<string, string> = {};

  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { name: roleName },
      create: {
        name: roleName,
        description: `${roleName} role`,
        isSystem: true,
      },
      update: {},
    });
    roleIds[roleName] = role.id;

    for (const permKey of permissionKeys) {
      const permissionId = permissionIds[permKey];
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }

  return roleIds;
}

function buildModuleSettings(posConfig: ReturnType<typeof posConfigSchema.parse>) {
  return [
    { module: "physical_products", enabled: posConfig.sellPhysical },
    { module: "services", enabled: posConfig.sellServices },
    { module: "rentals", enabled: posConfig.rentItems },
    { module: "inventory", enabled: posConfig.trackInventory },
  ];
}

export async function GET() {
  try {
    const ctx = await requireAuth();

    const business = await db.business.findFirst({
      where: {
        id: ctx.business.id,
        deletedAt: null,
      },
      include: {
        settings: true,
        moduleSettings: true,
        locations: {
          where: { deletedAt: null },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        },
        stripeAccount: true,
        subscription: true,
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    return NextResponse.json(business);
  } catch (error) {
    return handleApiError(error, "GET /api/business");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingEmployee = await db.employeeProfile.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
        deletedAt: null,
      },
    });

    if (existingEmployee) {
      return NextResponse.json(
        { error: "User already belongs to a business" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const data = createBusinessSchema.parse(body);
    const posConfig = posConfigSchema.parse(data.posConfig ?? {});
    const locationData = data.location ?? {
      name: "Main Location",
      country: "US",
      timezone: "America/New_York",
    };

    const roleIds = await ensureRolesAndPermissions();
    const ownerRoleId = roleIds["Owner"];

    if (!ownerRoleId) {
      throw new Error("Owner role could not be created");
    }

    const ownerName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const business = await db.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: {
          name: data.name,
          type: data.type,
          legalName: data.legalName,
          phone: data.phone,
          email: data.email || user.email,
          website: data.website || undefined,
          primaryColor: data.primaryColor,
          onboardingStep: "BUSINESS_PROFILE",
        },
      });

      const location = await tx.location.create({
        data: {
          businessId: created.id,
          name: locationData.name,
          street: locationData.street,
          city: locationData.city,
          state: locationData.state,
          zip: locationData.zip,
          country: locationData.country,
          timezone: locationData.timezone,
          taxRegion: locationData.taxRegion,
          isDefault: true,
        },
      });

      await tx.businessSetting.create({
        data: {
          businessId: created.id,
          enableCash: posConfig.acceptCash,
          enableBarcodeScanning: posConfig.barcodeScanning,
          enableReceiptPrinting: posConfig.receiptPrinting,
          requirePinAtRegister: posConfig.employeePinLogin,
        },
      });

      await tx.moduleSetting.createMany({
        data: buildModuleSettings(posConfig).map((setting) => ({
          businessId: created.id,
          ...setting,
        })),
      });

      await tx.stripeAccount.create({
        data: {
          businessId: created.id,
          status: "NOT_CONNECTED",
        },
      });

      await tx.subscription.create({
        data: {
          businessId: created.id,
          plan: "STARTER",
          status: "TRIALING",
          stripePriceId: STRIPE_PLANS.STARTER.priceId,
          trialEndsAt,
        },
      });

      const employee = await tx.employeeProfile.create({
        data: {
          businessId: created.id,
          userId: user.id,
          roleId: ownerRoleId,
          name: ownerName,
          email: user.email,
          status: "ACTIVE",
        },
      });

      await tx.employeeLocation.create({
        data: {
          employeeId: employee.id,
          locationId: location.id,
        },
      });

      return tx.business.findUnique({
        where: { id: created.id },
        include: {
          settings: true,
          moduleSettings: true,
          locations: true,
          stripeAccount: true,
          subscription: true,
          employees: {
            where: { id: employee.id },
            include: { role: true },
          },
        },
      });
    });

    await createAuditLog({
      businessId: business!.id,
      employeeId: business!.employees[0]?.id,
      action: "CREATE",
      entity: "Business",
      entityId: business!.id,
      details: { name: business!.name, type: business!.type },
    });

    return NextResponse.json(business, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/business");
  }
}
