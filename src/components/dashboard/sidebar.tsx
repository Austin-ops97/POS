"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  NAV_SECTIONS,
  isNavItemActive,
} from "@/components/dashboard/nav-items";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

type SidebarNavProps = {
  onNavigate?: () => void;
  className?: string;
};

export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn("flex-1 space-y-4 overflow-y-auto p-3 sm:p-4", className)}
      aria-label="Main"
    >
      {NAV_SECTIONS.map((section) => (
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
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors duration-200",
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
    <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-4 sm:px-6">
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

/** Permanent sidebar for large screens. */
export function DesktopSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex xl:w-64">
      <BrandHeader />
      <SidebarNav />
    </aside>
  );
}

type MobileNavProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Drawer navigation for phones and tablets in portrait. */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(20rem,100%)] p-0 lg:hidden" showClose>
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Primary application navigation</SheetDescription>
        </SheetHeader>
        <BrandHeader />
        <SidebarNav onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
