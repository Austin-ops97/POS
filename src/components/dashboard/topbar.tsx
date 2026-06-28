"use client";

import { UserButton } from "@clerk/nextjs";
import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type TopbarProps = {
  businessName?: string;
  locationName?: string;
};

export function Topbar({ businessName, locationName }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-slate-900">
          {businessName || "NexaPOS"}
        </h1>
        {locationName && (
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
            <MapPin className="h-4 w-4" />
            {locationName}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link href="/register">
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Open Register
          </Button>
        </Link>
        <UserButton />
      </div>
    </header>
  );
}
