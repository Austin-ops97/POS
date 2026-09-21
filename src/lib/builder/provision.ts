import { Prisma } from "@prisma/client";
import type { BusinessType } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureRolesAndPermissions } from "@/lib/roles-permissions";
import { createInvitationToken, INVITATION_TTL_MS, normalizeEmail } from "@/lib/employee-invitations";
import { moduleFlagsForPlan, type BuilderPlanKey } from "./plans";
import { emptyChecklist, mergeChecklist } from "./checklist";

const DEFAULT_PRIMARY_COLOR = "#1e3a5f";
const DEFAULT_TIMEZONE = "America/Chicago";

export async function createBusinessFromBuilder(input: {
  name: string;
  email?: string | null;
  type?: BusinessType;
  planKey: BuilderPlanKey;
  ownerName?: string | null;
  ownerEmail?: string | null;
}) {
  const roleIds = await ensureRolesAndPermissions(db);
  const ownerRoleId = roleIds.Owner;
  if (!ownerRoleId) throw new Error("Owner role could not be created");

  const flags = moduleFlagsForPlan(input.planKey);
  const ownerEmail = input.ownerEmail?.trim() ? normalizeEmail(input.ownerEmail) : null;
  const invitation = ownerEmail ? createInvitationToken() : null;
  const checklist = {
    ...emptyChecklist(),
    businessReady: true,
    planApplied: true,
    ownerInvited: Boolean(ownerEmail),
  };

  const created = await db.$transaction(
    async (tx) => {
      const business = await tx.business.create({
        data: {
          name: input.name.trim(),
          type: input.type ?? "HYBRID",
          email: input.email?.trim() || null,
          primaryColor: DEFAULT_PRIMARY_COLOR,
        },
      });
      const location = await tx.location.create({
        data: {
          businessId: business.id,
          name: "Main Location",
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
          displayTimezone: DEFAULT_TIMEZONE,
        },
      });
      await tx.workforceSettings.create({ data: { businessId: business.id } });
      await tx.moduleSetting.createMany({
        data: Object.entries(flags).map(([module, enabled]) => ({
          businessId: business.id,
          module,
          enabled,
        })),
      });
      await tx.stripeAccount.create({
        data: { businessId: business.id, status: "NOT_CONNECTED" },
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
      await tx.builderBusinessState.create({
        data: {
          businessId: business.id,
          planKey: input.planKey,
          customized: false,
          checklist,
        },
      });
      if (invitation && ownerEmail) {
        const employee = await tx.employeeProfile.create({
          data: {
            businessId: business.id,
            roleId: ownerRoleId,
            name: input.ownerName?.trim() || ownerEmail,
            email: ownerEmail,
            status: "INVITED",
            inviteTokenHash: invitation.hash,
            inviteExpiresAt: new Date(Date.now() + INVITATION_TTL_MS),
            invitedAt: new Date(),
            defaultLocationId: location.id,
          },
        });
        await tx.employeeLocation.create({
          data: { employeeId: employee.id, locationId: location.id },
        });
      }
      return business;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 }
  );

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  return {
    businessId: created.id,
    invitationUrl: invitation ? `${base}/join/${invitation.token}` : null,
    checklist: mergeChecklist(checklist, {}),
  };
}
