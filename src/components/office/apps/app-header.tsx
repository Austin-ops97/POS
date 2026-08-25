"use client";

import Link from "next/link";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import { OFFICE_ACCENTS, OFFICE_SUITE_ICONS } from "../office-suite-icons";
import { cn } from "@/lib/utils";

export function OfficeAppHeader({
  module,
  children,
  compact = false,
}: {
  module: OfficeSuiteModule;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  const Icon = OFFICE_SUITE_ICONS[module.icon];
  const accent = OFFICE_ACCENTS[module.accent] ?? OFFICE_ACCENTS.slate;
  return (
    <header className={compact ? "space-y-2" : "space-y-4"}>
      <Link href="/office" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />Office & Admin
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("rounded-2xl p-2.5 text-white shadow-sm sm:p-3", accent.icon)}><Icon className="h-5 w-5 sm:h-6 sm:w-6" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={cn("font-semibold tracking-tight text-slate-950", compact ? "text-xl sm:text-2xl" : "text-3xl")}>{module.name}</h1>
              <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"><CircleCheck className="h-3 w-3" />Works here</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">{module.description}</p>
          </div>
        </div>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </header>
  );
}
