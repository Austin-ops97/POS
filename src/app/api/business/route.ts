import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser, requireAuth } from "@/lib/auth";
import { createBusinessSchema, posConfigSchema } from "@/lib/validations";
import { ensureRolesAndPermissions } from "@/lib/roles-permissions";
import { defaultEnabledModules } from "@/lib/modules";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

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
        taxRates: { where: { isActive: true }, take: 5 },
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

    const roleIds = await ensureRolesAndPermissions(db);
    const ownerRoleId = roleIds["Owner"];

    if (!ownerRoleId) {
      throw new Error("Owner role could not be created");
    }

    const ownerName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

    const business = await db.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: {
          name: data.name,
          type: data.type ?? "RETAIL",
          legalName: data.legalName,
          phone: data.phone,
          email: data.email || user.email,
          website: data.website || undefined,
          primaryColor: data.primaryColor,
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

      await tx.workforceSettings.create({
        data: { businessId: created.id },
      });

      await tx.moduleSetting.createMany({
        data: defaultEnabledModules().map((setting) => ({
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

      const employee = await tx.employeeProfile.create({
        data: {
          businessId: created.id,
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

      await tx.taxRate.create({
        data: {
          businessId: created.id,
          locationId: location.id,
          name: "Sales Tax",
          rate: 0,
          appliesToProducts: true,
          appliesToServices: true,
          isActive: true,
        },
      });

      return tx.business.findUnique({
        where: { id: created.id },
        include: {
          settings: true,
          moduleSettings: true,
          locations: true,
          stripeAccount: true,
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
