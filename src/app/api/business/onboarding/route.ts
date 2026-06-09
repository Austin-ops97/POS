import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { onboardingPatchSchema, posConfigSchema } from "@/lib/validations";
import { STRIPE_PLANS } from "@/lib/stripe";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

function buildModuleSettings(posConfig: ReturnType<typeof posConfigSchema.parse>) {
  return [
    { module: "physical_products", enabled: posConfig.sellPhysical },
    { module: "services", enabled: posConfig.sellServices },
    { module: "rentals", enabled: posConfig.rentItems },
    { module: "inventory", enabled: posConfig.trackInventory },
  ];
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const data = onboardingPatchSchema.parse(body);

    const business = await db.business.findFirst({
      where: { id: ctx.business.id, deletedAt: null },
      include: {
        locations: {
          where: { deletedAt: null, isDefault: true },
          take: 1,
        },
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      if (data.businessProfile) {
        await tx.business.update({
          where: { id: ctx.business.id },
          data: {
            name: data.businessProfile.name,
            type: data.businessProfile.type,
            legalName: data.businessProfile.legalName,
            phone: data.businessProfile.phone,
            email: data.businessProfile.email || undefined,
            website: data.businessProfile.website || undefined,
            primaryColor: data.businessProfile.primaryColor,
          },
        });
      }

      if (data.location) {
        const defaultLocation = business.locations[0];
        if (defaultLocation) {
          await tx.location.update({
            where: { id: defaultLocation.id },
            data: data.location,
          });
        } else {
          await tx.location.create({
            data: {
              businessId: ctx.business.id,
              name: data.location.name ?? "Main Location",
              street: data.location.street,
              city: data.location.city,
              state: data.location.state,
              zip: data.location.zip,
              country: data.location.country ?? "US",
              timezone: data.location.timezone ?? "America/New_York",
              taxRegion: data.location.taxRegion,
              isDefault: true,
            },
          });
        }
      }

      if (data.posConfig) {
        const existingSettings = await tx.businessSetting.findUnique({
          where: { businessId: ctx.business.id },
        });
        const existingModules = await tx.moduleSetting.findMany({
          where: { businessId: ctx.business.id },
        });

        const moduleMap = Object.fromEntries(
          existingModules.map((m) => [m.module, m.enabled])
        );

        const posConfig = posConfigSchema.parse({
          sellPhysical: moduleMap.physical_products ?? true,
          sellServices: moduleMap.services ?? false,
          rentItems: moduleMap.rentals ?? false,
          trackInventory: moduleMap.inventory ?? true,
          acceptCash: existingSettings?.enableCash ?? true,
          barcodeScanning: existingSettings?.enableBarcodeScanning ?? true,
          receiptPrinting: existingSettings?.enableReceiptPrinting ?? true,
          employeePinLogin: existingSettings?.requirePinAtRegister ?? false,
          multipleLocations: false,
          ...data.posConfig,
        });

        await tx.businessSetting.upsert({
          where: { businessId: ctx.business.id },
          create: {
            businessId: ctx.business.id,
            enableCash: posConfig.acceptCash,
            enableBarcodeScanning: posConfig.barcodeScanning,
            enableReceiptPrinting: posConfig.receiptPrinting,
            requirePinAtRegister: posConfig.employeePinLogin,
          },
          update: {
            enableCash: posConfig.acceptCash,
            enableBarcodeScanning: posConfig.barcodeScanning,
            enableReceiptPrinting: posConfig.receiptPrinting,
            requirePinAtRegister: posConfig.employeePinLogin,
          },
        });

        for (const setting of buildModuleSettings(posConfig)) {
          await tx.moduleSetting.upsert({
            where: {
              businessId_module: {
                businessId: ctx.business.id,
                module: setting.module,
              },
            },
            create: {
              businessId: ctx.business.id,
              module: setting.module,
              enabled: setting.enabled,
            },
            update: { enabled: setting.enabled },
          });
        }
      }

      if (data.plan) {
        const planConfig = STRIPE_PLANS[data.plan];
        await tx.subscription.update({
          where: { businessId: ctx.business.id },
          data: {
            plan: data.plan,
            stripePriceId: planConfig.priceId,
          },
        });
      }

      const onboardingComplete =
        data.complete ?? data.step === "COMPLETED";

      await tx.business.update({
        where: { id: ctx.business.id },
        data: {
          onboardingStep: data.step,
          onboardingComplete,
          demoMode: onboardingComplete ? false : undefined,
        },
      });
    });

    const updated = await db.business.findFirst({
      where: { id: ctx.business.id },
      include: {
        settings: true,
        moduleSettings: true,
        locations: { where: { deletedAt: null } },
        subscription: true,
        stripeAccount: true,
      },
    });

    await createAuditLog({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      action: "SETTINGS_CHANGE",
      entity: "Business",
      entityId: ctx.business.id,
      details: { onboardingStep: data.step, complete: data.complete },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/business/onboarding");
  }
}
