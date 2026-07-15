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

type SearchHit =
  | { kind: "page"; label: string; href: string }
  | { kind: "product"; label: string; href: string; detail?: string }
  | { kind: "customer"; label: string; href: string; detail?: string }
  | { kind: "order"; label: string; href: string; detail?: string };

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
      return NAV_ITEMS.slice(0, 8).map(
        (item): SearchHit => ({
          kind: "page",
          label: item.label,
          href: item.href,
        })
      );
    }
    return NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q)).map(
      (item): SearchHit => ({
        kind: "page",
        label: item.label,
        href: item.href,
      })
    );
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
        const [productsRes, customersRes, ordersRes] = await Promise.all([
          fetch(`/api/products?search=${encodeURIComponent(q)}&limit=5`),
          fetch(`/api/customers?search=${encodeURIComponent(q)}&limit=5`),
          fetch(`/api/orders?search=${encodeURIComponent(q)}&limit=5`),
        ]);
        const next: SearchHit[] = [...pageHits];
        if (productsRes.ok) {
          const data = await productsRes.json();
          for (const p of data.products || []) {
            next.push({
              kind: "product",
              label: p.name,
              href: `/products/${p.id}`,
              detail: p.sku || undefined,
            });
          }
        }
        if (customersRes.ok) {
          const data = await customersRes.json();
          for (const c of data.customers || []) {
            next.push({
              kind: "customer",
              label: `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`,
              href: `/customers/${c.id}`,
              detail: c.email || c.phone || undefined,
            });
          }
        }
        if (ordersRes.ok) {
          const data = await ordersRes.json();
          for (const o of data.orders || []) {
            next.push({
              kind: "order",
              label: o.orderNumber,
              href: `/orders/${o.id}`,
              detail: o.status,
            });
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
              Jump to pages, products, customers, or orders.
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
