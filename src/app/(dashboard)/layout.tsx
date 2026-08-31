import { redirect } from "next/navigation";
import { getAuthContext, isClerkConfigured } from "@/lib/auth";
import { ensureProvisionedBusinessForUser } from "@/lib/provision-business";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getModuleSettings } from "@/lib/queries";
import { db } from "@/lib/db";
import { normalizeModuleKey } from "@/lib/modules";
import { getEmployeeModuleAccess } from "@/lib/access-control";
import { hasAnyPermission, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { TimezoneProvider } from "@/components/providers/timezone-provider";

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

  const [moduleSettings, employeeCount, access] = await Promise.all([
    getModuleSettings(ctx),
    db.employeeProfile.count({
      where: {
        businessId: ctx.business.id,
        deletedAt: null,
        status: "ACTIVE",
      },
    }),
    getEmployeeModuleAccess(ctx),
  ]);

  const expensesModule = moduleSettings.find(
    (m) => normalizeModuleKey(m.module) === "EXPENSES"
  );
  const expensesEnabled = expensesModule ? expensesModule.enabled : true;
  const officeModule = moduleSettings.find(
    (m) => normalizeModuleKey(m.module) === "OFFICE"
  );
  const officeEnabled = officeModule ? officeModule.enabled : true;
  const isOwner = ctx.employee.role.name === "Owner";
  const allowedHrefs = [
    "/dashboard",
    ...(access.POS && hasPermission(ctx, PERMISSIONS.OPEN_REGISTER) ? ["/register"] : []),
    ...(access.PAYMENTS && hasAnyPermission(ctx, [PERMISSIONS.PROCESS_SALE, PERMISSIONS.MANAGE_STRIPE, PERMISSIONS.VIEW_REPORTS]) ? ["/payments"] : []),
    ...(access.CATALOG && hasPermission(ctx, PERMISSIONS.VIEW_PRODUCTS) ? ["/products"] : []),
    ...(access.INVENTORY && hasPermission(ctx, PERMISSIONS.VIEW_INVENTORY) ? ["/inventory"] : []),
    ...(access.ORDERS && hasAnyPermission(ctx, [PERMISSIONS.PROCESS_SALE, PERMISSIONS.PROCESS_REFUND, PERMISSIONS.VIEW_REPORTS]) ? ["/orders"] : []),
    ...(access.CUSTOMERS && hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS) ? ["/customers"] : []),
    ...(access.WORKFORCE && hasAnyPermission(ctx, [PERMISSIONS.MANAGE_EMPLOYEES, PERMISSIONS.VIEW_WORKFORCE, PERMISSIONS.REQUEST_TIME_OFF]) ? ["/employees", "/workforce"] : []),
    ...(access.CONNECTIONS && hasPermission(ctx, PERMISSIONS.VIEW_CONNECTIONS) ? ["/connections"] : []),
    ...(access.REPORTS && hasPermission(ctx, PERMISSIONS.VIEW_REPORTS) ? ["/reports"] : []),
    ...(access.OFFICE && hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS)
      ? [
          "/office",
          "/office/documents",
          "/office/apps/projects",
          "/office/apps/task-assignments",
          "/office/apps/forms-approvals",
          "/office/apps/automations-ai",
          ...(hasPermission(ctx, PERMISSIONS.MANAGE_PROJECT_REMINDERS) ? ["/office/reminders"] : []),
          ...(hasPermission(ctx, PERMISSIONS.APPROVE_PROJECT_COMPLETION) ? ["/office/approvals"] : []),
        ]
      : []),
    ...(access.EXPENSES && hasAnyPermission(ctx, [PERMISSIONS.CREATE_EXPENSE, PERMISSIONS.VIEW_OWN_EXPENSES, PERMISSIONS.VIEW_TEAM_EXPENSES, PERMISSIONS.VIEW_EXPENSE_REPORTS]) ? ["/finance/expenses", "/finance/statements", "/finance/cards", "/finance/reimbursements", "/finance/reports", "/finance/budgets"] : []),
    ...(isOwner || hasAnyPermission(ctx, [PERMISSIONS.MANAGE_EMPLOYEES, PERMISSIONS.MANAGE_LOCATIONS, PERMISSIONS.MANAGE_STRIPE]) ? ["/settings"] : []),
  ];

  return (
    <TimezoneProvider displayTimezone={ctx.displayTimezone}>
      <DashboardShell
      businessName={ctx.business.name}
      locationName={ctx.location?.name}
      authEnabled={isClerkConfigured()}
      navVisibility={{
        expensesEnabled: expensesEnabled && access.EXPENSES,
        officeEnabled: officeEnabled && access.OFFICE,
        showWorkforce: employeeCount > 1,
        allowedHrefs,
      }}
      canOpenRegister={access.POS && hasPermission(ctx, PERMISSIONS.OPEN_REGISTER)}
      isPlatformAdmin={ctx.isPlatformAdmin}
    >
      {children}
    </DashboardShell>
    </TimezoneProvider>
  );
}
