"use client";

import { useState } from "react";
import { DesktopSidebar, MobileNav } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import type { NavVisibility } from "@/components/dashboard/nav-items";
import { GlobalSearch } from "@/components/dashboard/global-search";

type DashboardShellProps = {
  children: React.ReactNode;
  businessName?: string;
  locationName?: string;
  authEnabled?: boolean;
  navVisibility?: NavVisibility;
};

export function DashboardShell({
  children,
  businessName,
  locationName,
  authEnabled,
  navVisibility,
}: DashboardShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden">
      <DesktopSidebar visibility={navVisibility} />
      <MobileNav
        open={navOpen}
        onOpenChange={setNavOpen}
        visibility={navVisibility}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          businessName={businessName}
          locationName={locationName}
          authEnabled={authEnabled}
          onMenuClick={() => setNavOpen(true)}
          searchSlot={<GlobalSearch />}
        />
        <main className="page-container min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
    </div>
  );
}
