import { redirect } from "next/navigation";
import { getAuthContext, isClerkConfigured } from "@/lib/auth";
import { ensureProvisionedBusinessForUser } from "@/lib/provision-business";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          businessName={ctx.business.name}
          locationName={ctx.location?.name}
          authEnabled={isClerkConfigured()}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  );
}
