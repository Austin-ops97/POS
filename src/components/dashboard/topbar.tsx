"use client";

import { Show, UserButton } from "@clerk/nextjs";
import { MapPin, Menu, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type TopbarProps = {
  businessName?: string;
  locationName?: string;
  authEnabled?: boolean;
  onMenuClick?: () => void;
  searchSlot?: React.ReactNode;
};

export function Topbar({
  businessName,
  locationName,
  authEnabled = true,
  onMenuClick,
  searchSlot,
}: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 pt-[env(safe-area-inset-top)] sm:h-16 sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onMenuClick ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
            {businessName || "NexaPOS"}
          </h1>
        </div>
        {locationName ? (
          <div className="hidden min-w-0 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm text-slate-600 sm:flex">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{locationName}</span>
          </div>
        ) : null}
      </div>
      {searchSlot ? (
        <div className="mx-1 flex min-w-0 flex-1 justify-center sm:mx-3">{searchSlot}</div>
      ) : null}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Button asChild size="default" className="hidden sm:inline-flex">
          <Link href="/register">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Open Register
          </Link>
        </Button>
        <Button asChild size="icon" className="sm:hidden" aria-label="Open Register">
          <Link href="/register">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </Link>
        </Button>
        {authEnabled ? (
          <Show when="signed-in">
            <UserButton />
          </Show>
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white"
            aria-hidden="true"
          >
            <User className="h-4 w-4" />
          </div>
        )}
      </div>
    </header>
  );
}
