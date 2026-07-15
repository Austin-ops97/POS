import { redirect } from "next/navigation";
import { getAuthContext, isClerkConfigured } from "@/lib/auth";
import { ensureProvisionedBusinessForUser } from "@/lib/provision-business";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getModuleSettings } from "@/lib/queries";
import { db } from "@/lib/db";
import { normalizeModuleKey } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const provisioned = await ensureProvisionedBusinessForUser();
  if (!provisioned) {
    redirect(isClerkConfigured() ? "/sign-in" : "/sign-in");
  }

  const ctx = await getAuthContext(provisioned.businessId);
  if (!ctx) {
    redirect("/sign-in");
  }

  const [moduleSettings, employeeCount] = await Promise.all([
    getModuleSettings(ctx),
    db.employeeProfile.count({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        status: "ACTIVE",
      },
    }),
  ]);

  const expensesModule = moduleSettings.find(
    (m) => normalizeModuleKey(m.module) === "EXPENSES"
  );
  const expensesEnabled = expensesModule ? expensesModule.enabled : true;

  return (
    <DashboardShell
      businessName={ctx.business.name}
      locationName={ctx.location?.name}
      authEnabled={isClerkConfigured()}
      navVisibility={{
        expensesEnabled,
        showWorkforce: employeeCount > 1,
      }}
    >
      {children}
    </DashboardShell>
  );
}
