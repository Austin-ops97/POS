"use client";

import { useState } from "react";
import { DesktopSidebar, MobileNav } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import type { NavVisibility } from "@/components/dashboard/nav-items";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { NotificationBell } from "@/components/dashboard/notification-bell";

type DashboardShellProps = {
  children: React.ReactNode;
  businessName?: string;
  locationName?: string;
  authEnabled?: boolean;
  navVisibility?: NavVisibility;
  canOpenRegister?: boolean;
  isPlatformAdmin?: boolean;
};

export function DashboardShell({
  children,
  businessName,
  locationName,
  authEnabled,
  navVisibility,
  canOpenRegister,
  isPlatformAdmin,
}: DashboardShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-slate-50 print:block print:h-auto print:max-h-none print:overflow-visible">
      <DesktopSidebar visibility={navVisibility} />
      <MobileNav
        open={navOpen}
        onOpenChange={setNavOpen}
        visibility={navVisibility}
      />
      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden print:block print:h-auto print:overflow-visible">
        <div className="print:hidden">
        <Topbar
          businessName={businessName}
          locationName={locationName}
          authEnabled={authEnabled}
          onMenuClick={() => setNavOpen(true)}
          searchSlot={<GlobalSearch />}
          notificationSlot={<NotificationBell />}
          canOpenRegister={canOpenRegister}
          isPlatformAdmin={isPlatformAdmin}
        />
        </div>
        <main className="page-container flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-slate-50 pb-[max(1.25rem,env(safe-area-inset-bottom))] print:overflow-visible print:bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
