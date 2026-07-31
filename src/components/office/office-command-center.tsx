"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Command,
  FilePlus2,
  Search,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  OFFICE_SUITE_GROUPS,
  OFFICE_SUITE_MODULES,
  officeModuleHref,
  type OfficeSuiteGroup,
} from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { OFFICE_ACCENTS, OFFICE_SUITE_ICONS } from "./office-suite-icons";

type OfficeMetrics = {
  documents: number;
  customers: number | null;
  employees: number | null;
  openOrders: number | null;
  openWork: number;
  pendingExpenses: number | null;
};

type Props = {
  businessName: string;
  firstName: string;
  metrics: OfficeMetrics;
  recentRecords: OfficeWorkspaceRecordSummary[];
  canCreate: boolean;
};

const FAVORITES_KEY = "nexapos-office-favorites-v1";

export function OfficeCommandCenter({ businessName, firstName, metrics, recentRecords, canCreate }: Props) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<OfficeSuiteGroup | "All">("All");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(FAVORITES_KEY);
      if (value) setFavorites(JSON.parse(value));
    } catch {
      // Local preferences are optional; the suite remains fully usable without them.
    }
  }, []);

  useEffect(() => {
    if (!showSearch) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowSearch(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showSearch]);

  const visibleModules = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return OFFICE_SUITE_MODULES.filter((module) => {
      if (group !== "All" && module.group !== group) return false;
      return (
        !normalized ||
        `${module.name} ${module.description} ${module.features.join(" ")}`.toLowerCase().includes(normalized)
      );
    }).sort((a, b) => {
      const aFavorite = favorites.includes(a.slug) ? 1 : 0;
      const bFavorite = favorites.includes(b.slug) ? 1 : 0;
      return bFavorite - aFavorite;
    });
  }, [favorites, group, query]);

  function toggleFavorite(slug: string) {
    setFavorites((current) => {
      const next = current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug];
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // Ignore private browsing storage failures.
      }
      return next;
    });
  }

  return (
    <div className="space-y-7 pb-8">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-slate-950 px-5 py-6 text-white shadow-xl shadow-slate-200 sm:px-7 sm:py-8 xl:px-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.16),transparent_30%)]" />
        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />Office & Admin
              </Badge>
              <span className="text-xs text-slate-400">Connected across {businessName}</span>
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Good day, {firstName}. What needs to move forward?
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Create, communicate, coordinate, and protect the business from one connected workspace.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {canCreate ? (
                <Button asChild className="rounded-xl bg-white text-slate-950 hover:bg-slate-100">
                  <Link href="/office/new"><FilePlus2 className="h-4 w-4" />New document</Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setShowSearch(true)}
              >
                <Search className="h-4 w-4" />Find a tool
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-500/20 p-2.5 text-violet-200"><Bot className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><p className="font-semibold">Nexa Assist</p><span className="flex items-center gap-1 text-[11px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Ready</span></div>
                <p className="mt-1 text-sm leading-5 text-slate-300">Prepare a proposal, summarize a file, or turn notes into assigned work.</p>
                <Link href="/office/apps/automations-ai" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-200 hover:text-white">Open assistant <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Business overview">
        {[
          { label: "Documents", value: metrics.documents, detail: "stored securely", href: "/office/documents" },
          { label: "Customers", value: metrics.customers, detail: "connected records", href: "/customers" },
          { label: "Team", value: metrics.employees, detail: "active people", href: "/employees" },
          { label: "Orders", value: metrics.openOrders, detail: "need attention", href: "/orders" },
          { label: "Open work", value: metrics.openWork, detail: "across Office", href: "/office/apps/projects" },
          { label: "Expenses", value: metrics.pendingExpenses, detail: "pending review", href: "/finance/expenses/approvals" },
        ].map((metric) => metric.value == null ? null : (
          <Link key={metric.label} href={metric.href} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm">
            <p className="text-2xl font-semibold tracking-tight text-slate-950">{metric.value.toLocaleString()}</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{metric.label}</p>
            <p className="mt-0.5 text-xs text-slate-600">{metric.detail}</p>
          </Link>
        ))}
      </section>

      <section>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Workspace directory</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Everything your business needs</h2>
            <p className="mt-1 text-sm text-slate-500">Favorites stay at the top. Search reaches every capability, not only app names.</p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
            {(["All", ...OFFICE_SUITE_GROUPS] as const).map((item) => (
              <button key={item} type="button" onClick={() => setGroup(item)} className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition", group === item ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900")}>{item}</button>
            ))}
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools, workflows, and capabilities…" className="h-12 rounded-2xl border-slate-200 bg-white pl-10 pr-10 shadow-sm" />
          {query ? <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear search"><X className="h-4 w-4" /></button> : null}
        </div>

        {visibleModules.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {visibleModules.map((module) => {
              const Icon = OFFICE_SUITE_ICONS[module.icon];
              const accent = OFFICE_ACCENTS[module.accent] ?? OFFICE_ACCENTS.slate;
              const favorite = favorites.includes(module.slug);
              return (
                <article key={module.slug} className="group relative flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn("rounded-xl p-2.5 text-white shadow-sm", accent.icon)}><Icon className="h-5 w-5" /></div>
                    <button type="button" onClick={() => toggleFavorite(module.slug)} className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-100 hover:text-amber-500" aria-label={favorite ? `Remove ${module.name} from favorites` : `Add ${module.name} to favorites`}><Star className={cn("h-4 w-4", favorite && "fill-amber-400 text-amber-400")} /></button>
                  </div>
                  <p className={cn("mt-4 text-[11px] font-semibold uppercase tracking-[0.12em]", accent.text)}>{module.eyebrow}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">{module.name}</h3>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-500">{module.description}</p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{module.features.length} capabilities</div>
                    <Link href={officeModuleHref(module)} className="stretched-link inline-flex items-center gap-1 text-sm font-semibold text-slate-800 hover:text-slate-950">Open <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-800">No matching tools</h3><p className="mt-1 text-sm text-slate-500">Try a broader phrase or select All.</p>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Connected work</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Recent activity</h2></div><Clock3 className="h-5 w-5 text-slate-300" /></div>
          {recentRecords.length ? (
            <div className="mt-4 divide-y divide-slate-100">
              {recentRecords.slice(0, 5).map((record) => {
                const workspaceDefinition = OFFICE_SUITE_MODULES.find((item) => item.slug === record.workspace);
                if (!workspaceDefinition) return null;
                const Icon = OFFICE_SUITE_ICONS[workspaceDefinition.icon];
                return <Link key={record.id} href={officeModuleHref(workspaceDefinition)} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="rounded-lg bg-slate-100 p-2"><Icon className="h-4 w-4 text-slate-600" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{record.title}</p><p className="text-xs text-slate-600">{workspaceDefinition.name} · {record.createdBy.name}</p></div><span className="shrink-0 text-xs text-slate-600">{formatDistanceToNow(new Date(record.updatedAt), { addSuffix: true })}</span></Link>;
              })}
            </div>
          ) : <div className="mt-4 rounded-xl bg-slate-50 p-5 text-center"><p className="text-sm font-medium text-slate-700">Your connected activity will appear here.</p><p className="mt-1 text-xs text-slate-500">Start from any template to create the first record.</p></div>}
        </div>
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 sm:p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white"><Zap className="h-5 w-5" /></div>
          <h2 className="mt-4 text-lg font-semibold text-slate-950">A connected workflow</h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">Customer approval can become an invoice, a project, assigned tasks, and a retained document without entering the same information twice.</p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-600">
            {['Customer', 'Proposal', 'Approval', 'Invoice', 'Project'].map((item, index) => <span key={item} className="contents"><span className="rounded-lg border border-violet-100 bg-white px-2.5 py-1.5">{item}</span>{index < 4 ? <ChevronRight className="h-3.5 w-3.5 text-violet-300" /> : null}</span>)}
          </div>
          <Button asChild variant="outline" className="mt-5 rounded-xl border-violet-200 bg-white text-violet-700 hover:bg-violet-50"><Link href="/office/apps/automations-ai">Build a workflow <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      </section>

      {showSearch ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 p-3 pt-[10vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Find an Office tool" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSearch(false); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 p-4"><Search className="h-5 w-5 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What would you like to do?" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400" /><kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">ESC</kbd><button type="button" onClick={() => setShowSearch(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <div className="max-h-[55vh] overflow-y-auto p-2">{visibleModules.slice(0, 8).map((module) => { const Icon = OFFICE_SUITE_ICONS[module.icon]; return <Link key={module.slug} href={officeModuleHref(module)} onClick={() => setShowSearch(false)} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-100"><div className="rounded-lg bg-slate-100 p-2"><Icon className="h-4 w-4 text-slate-600" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{module.name}</p><p className="truncate text-xs text-slate-500">{module.description}</p></div><Command className="h-3.5 w-3.5 text-slate-300" /></Link>; })}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
