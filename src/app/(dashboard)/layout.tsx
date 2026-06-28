import { redirect } from "next/navigation";
import { getAuthContext, isClerkConfigured } from "@/lib/auth";
import { loadSubscriptionAccess } from "@/lib/subscription-server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { SubscriptionGate } from "@/components/dashboard/subscription-gate";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  if (!ctx) {
    redirect("/onboarding");
  }

  if (!ctx.business.onboardingComplete) {
    redirect("/onboarding");
  }

  const { access } = await loadSubscriptionAccess(ctx.business.id);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          businessName={ctx.business.name}
          locationName={ctx.location?.name}
          authEnabled={isClerkConfigured()}
        />
        <SubscriptionGate access={access}>
          <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
        </SubscriptionGate>
      </div>
    </div>
  );
}
