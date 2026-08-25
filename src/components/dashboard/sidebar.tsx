"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NAV_SECTIONS,
  filterNavSections,
  isNavItemActive,
  type NavVisibility,
} from "@/components/dashboard/nav-items";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const SIDEBAR_STORAGE_KEY = "nexapos.sidebar.open";

type SidebarNavProps = {
  onNavigate?: () => void;
  className?: string;
  visibility?: NavVisibility;
};

export function SidebarNav({
  onNavigate,
  className,
  visibility = { expensesEnabled: true, showWorkforce: true, officeEnabled: true },
}: SidebarNavProps) {
  const pathname = usePathname();
  const sections = filterNavSections(NAV_SECTIONS, visibility);

  return (
    <nav
      className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto p-3 pb-6 sm:p-4 sm:pb-8", className)}
      aria-label="Main"
    >
      {sections.map((section) => (
        <div key={section.id} className="space-y-1">
          {section.label ? (
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {section.label}
            </p>
          ) : null}
          {section.items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-11 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors duration-200",
                  active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function BrandHeader() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 whitespace-nowrap border-b border-slate-200 px-4 sm:px-6">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white"
        aria-hidden="true"
      >
        N
      </div>
      <span className="text-lg font-semibold text-slate-900">NexaPOS</span>
    </div>
  );
}

/** Collapsible sidebar for large screens, with an edge tab to open and close it. */
export function DesktopSidebar({ visibility }: { visibility?: NavVisibility }) {
  const panelId = useId();
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "closed") {
        setOpen(false);
      }
    } catch {
      /* ignore private-mode storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? "open" : "closed");
    } catch {
      /* ignore private-mode storage */
    }
  }, [open, ready]);

  return (
    <div
      className="sidebar-rail"
      data-open={open ? "true" : "false"}
      data-ready={ready ? "true" : undefined}
    >
      <div className="sidebar-rail-clip">
        <aside
          id={panelId}
          className="sidebar-rail-panel"
          aria-hidden={!open}
          inert={!open ? true : undefined}
        >
          <BrandHeader />
          <SidebarNav visibility={visibility} className="min-h-0" />
        </aside>
      </div>
      <button
        type="button"
        className="sidebar-tab"
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={open ? "Close navigation" : "Open navigation"}
        title={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronLeft className="sidebar-tab-icon h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
      </button>
    </div>
  );
}

type MobileNavProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibility?: NavVisibility;
};

/** Drawer navigation for phones and tablets in portrait. */
export function MobileNav({ open, onOpenChange, visibility }: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(20rem,100%)] p-0 lg:hidden" showClose>
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Primary application navigation</SheetDescription>
        </SheetHeader>
        <BrandHeader />
        <SidebarNav
          visibility={visibility}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
