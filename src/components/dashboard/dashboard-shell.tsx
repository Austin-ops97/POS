"use client";

import { useState } from "react";
import { DesktopSidebar, MobileNav } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

type DashboardShellProps = {
  children: React.ReactNode;
  businessName?: string;
  locationName?: string;
  authEnabled?: boolean;
};

export function DashboardShell({
  children,
  businessName,
  locationName,
  authEnabled,
}: DashboardShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden">
      <DesktopSidebar />
      <MobileNav open={navOpen} onOpenChange={setNavOpen} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          businessName={businessName}
          locationName={locationName}
          authEnabled={authEnabled}
          onMenuClick={() => setNavOpen(true)}
        />
        <main className="page-container min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </div>
  );
}
