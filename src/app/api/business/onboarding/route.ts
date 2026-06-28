import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  onboardingPatchSchema,
  posConfigSchema,
  receiptSettingsSchema,
} from "@/lib/validations";
import { STRIPE_PLANS } from "@/lib/stripe";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/api-utils";

const MODULE_KEY_ALIASES: Record<string, string> = {
  retail: "RETAIL",
  physical_products: "RETAIL",
  service: "SERVICE",
  services: "SERVICE",
  rental: "RENTAL",
  rentals: "RENTAL",
};

function resolveModuleEnabled(
  moduleMap: Record<string, boolean>,
  canonicalKey: string,
  fallback: boolean
): boolean {
  if (canonicalKey in moduleMap) return moduleMap[canonicalKey];
  for (const [alias, key] of Object.entries(MODULE_KEY_ALIASES)) {
    if (key === canonicalKey && alias in moduleMap) {
      return moduleMap[alias];
    }
  }
  return fallback;
}

function buildModuleSettings(posConfig: ReturnType<typeof posConfigSchema.parse>) {
  return [
    { module: "RETAIL", enabled: posConfig.sellPhysical ?? true },
    { module: "SERVICE", enabled: posConfig.sellServices ?? false },
    { module: "RENTAL", enabled: posConfig.rentItems ?? false },
    { module: "inventory", enabled: posConfig.trackInventory ?? true },
  ];
}

function moduleSettingsForBusinessType(type: string) {
  switch (type) {
    case "SERVICE":
      return { RETAIL: false, SERVICE: true, RENTAL: false };
    case "RENTAL":
      return { RETAIL: false, SERVICE: false, RENTAL: true };
    case "RESTAURANT":
    case "HYBRID":
      return { RETAIL: true, SERVICE: true, RENTAL: false };
    default:
      return { RETAIL: true, SERVICE: false, RENTAL: false };
  }
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
        taxRates: { where: { isActive: true }, take: 1 },
      },
    });

    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      const profileData = data.businessProfile ?? data.businessInfo;
      if (profileData) {
        await tx.business.update({
          where: { id: ctx.business.id },
          data: {
            name: profileData.name,
            legalName: profileData.legalName,
            phone: profileData.phone,
            email: profileData.email || undefined,
            website: profileData.website || undefined,
            primaryColor: profileData.primaryColor,
            ...(data.businessProfile?.type
              ? { type: data.businessProfile.type }
              : {}),
          },
        });
      }

      if (data.businessType?.type) {
        const type = data.businessType.type;
        await tx.business.update({
          where: { id: ctx.business.id },
          data: { type },
        });

        const modules = moduleSettingsForBusinessType(type);
        for (const [module, enabled] of Object.entries(modules)) {
          await tx.moduleSetting.upsert({
            where: {
              businessId_module: {
                businessId: ctx.business.id,
                module,
              },
            },
            create: {
              businessId: ctx.business.id,
              module,
              enabled,
            },
            update: { enabled },
          });
        }
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

      if (data.taxSettings) {
        const defaultLocation = business.locations[0];
        const existingTax = business.taxRates[0];
        if (existingTax) {
          await tx.taxRate.update({
            where: { id: existingTax.id },
            data: {
              name: data.taxSettings.name ?? existingTax.name,
              rate: data.taxSettings.rate ?? existingTax.rate,
              appliesToProducts:
                data.taxSettings.appliesToProducts ?? existingTax.appliesToProducts,
              appliesToServices:
                data.taxSettings.appliesToServices ?? existingTax.appliesToServices,
            },
          });
        } else if (defaultLocation) {
          await tx.taxRate.create({
            data: {
              businessId: ctx.business.id,
              locationId: defaultLocation.id,
              name: data.taxSettings.name ?? "Sales Tax",
              rate: data.taxSettings.rate ?? 0,
              appliesToProducts: data.taxSettings.appliesToProducts ?? true,
              appliesToServices: data.taxSettings.appliesToServices ?? true,
              isActive: true,
            },
          });
        }
      }

      if (data.receiptSettings) {
        const receipt = receiptSettingsSchema.partial().parse(data.receiptSettings);
        const existingSettings = await tx.businessSetting.findUnique({
          where: { businessId: ctx.business.id },
        });
        await tx.businessSetting.upsert({
          where: { businessId: ctx.business.id },
          create: {
            businessId: ctx.business.id,
            receiptFooter: receipt.receiptFooter || null,
            showCashierOnReceipt: receipt.showCashierOnReceipt ?? true,
            showCustomerOnReceipt: receipt.showCustomerOnReceipt ?? true,
            showSkuOnReceipt: receipt.showSkuOnReceipt ?? false,
            enableReceiptPrinting: receipt.enableReceiptPrinting ?? true,
          },
          update: {
            ...(receipt.receiptFooter !== undefined
              ? { receiptFooter: receipt.receiptFooter || null }
              : {}),
            ...(receipt.showCashierOnReceipt !== undefined
              ? { showCashierOnReceipt: receipt.showCashierOnReceipt }
              : {}),
            ...(receipt.showCustomerOnReceipt !== undefined
              ? { showCustomerOnReceipt: receipt.showCustomerOnReceipt }
              : {}),
            ...(receipt.showSkuOnReceipt !== undefined
              ? { showSkuOnReceipt: receipt.showSkuOnReceipt }
              : {}),
            ...(receipt.enableReceiptPrinting !== undefined
              ? { enableReceiptPrinting: receipt.enableReceiptPrinting }
              : {}),
          },
        });
        void existingSettings;
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
          sellPhysical: resolveModuleEnabled(moduleMap, "RETAIL", true),
          sellServices: resolveModuleEnabled(moduleMap, "SERVICE", false),
          rentItems: resolveModuleEnabled(moduleMap, "RENTAL", false),
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
        taxRates: { where: { isActive: true } },
      },
    });

    if (!data.autoSave) {
      await createAuditLog({
        businessId: ctx.business.id,
        employeeId: ctx.employee.id,
        action: "SETTINGS_CHANGE",
        entity: "Business",
        entityId: ctx.business.id,
        details: { onboardingStep: data.step, complete: data.complete },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "PATCH /api/business/onboarding");
  }
}
