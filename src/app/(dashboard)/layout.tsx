import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();

  if (!ctx) {
    redirect("/onboarding");
  }

  if (!isDemoMode() && !ctx.business.onboardingComplete) {
    redirect("/onboarding");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          businessName={ctx.business.name}
          locationName={ctx.location?.name}
          isDemo={isDemoMode()}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  );
}
