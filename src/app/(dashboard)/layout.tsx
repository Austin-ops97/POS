import { redirect } from "next/navigation";
import { getAuthContext, isClerkConfigured } from "@/lib/auth";
import { ensureProvisionedBusinessForUser } from "@/lib/provision-business";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

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

  return (
    <DashboardShell
      businessName={ctx.business.name}
      locationName={ctx.location?.name}
      authEnabled={isClerkConfigured()}
    >
      {children}
    </DashboardShell>
  );
}
