"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "@/components/dashboard/nav-items";
import { OFFICE_SUITE_MODULES, officeModuleHref } from "@/lib/office/suite";

type SearchHit = {
  kind: "page" | "product" | "customer" | "employee" | "vendor" | "project" | "transaction" | "expense" | "receipt" | "document" | "invoice" | "order" | "tool";
  label: string;
  href: string;
  detail?: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pageHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...NAV_ITEMS.slice(0, 6).map(
        (item): SearchHit => ({
          kind: "page",
          label: item.label,
          href: item.href,
        })
      ), ...OFFICE_SUITE_MODULES.slice(0, 4).map((module): SearchHit => ({
        kind: "tool",
        label: module.name,
        href: officeModuleHref(module),
        detail: module.eyebrow,
      }))];
    }
    const pages = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q)).map(
      (item): SearchHit => ({
        kind: "page",
        label: item.label,
        href: item.href,
      })
    );
    const tools = OFFICE_SUITE_MODULES.filter((module) =>
      `${module.name} ${module.description} ${module.features.join(" ")}`.toLowerCase().includes(q)
    ).map((module): SearchHit => ({
      kind: "tool",
      label: module.name,
      href: officeModuleHref(module),
      detail: module.description,
    }));
    return [...pages, ...tools];
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setHits(pageHits);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const next: SearchHit[] = [...pageHits];
        if (response.ok) {
          const data = await response.json();
          for (const hit of data.hits || []) {
            next.push(hit);
          }
        }
        setHits(next);
      } catch {
        setHits(pageHits);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [open, query, pageHits]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden h-10 min-w-0 flex-1 justify-start gap-2 text-slate-500 md:inline-flex lg:max-w-xs"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Search…</span>
        <kbd className="ml-auto hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 lg:inline">
          ⌘K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="md:hidden"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>
              Find pages, people, sales, expenses, receipts, and documents.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              className="pl-9"
              autoFocus
            />
          </div>
          <ul className="max-h-80 space-y-1 overflow-y-auto" role="listbox" aria-label="Search results">
            {loading && hits.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-slate-500">Searching…</li>
            ) : hits.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-slate-500">No results</li>
            ) : (
              hits.map((hit) => (
                <li key={`${hit.kind}-${hit.href}-${hit.label}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-100"
                    onClick={() => {
                      setOpen(false);
                      router.push(hit.href);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">
                        {hit.label}
                      </span>
                      {"detail" in hit && hit.detail ? (
                        <span className="block truncate text-xs text-slate-500">
                          {hit.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-400">
                      {hit.kind}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
