"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExpenseStatusBadge } from "./status-badge";
import { toast } from "sonner";

type ExpenseRow = {
  id: string;
  merchant: string;
  total: unknown;
  status: string;
  purchaseDate: string | Date;
  missingReceipt: boolean;
  employee: { name: string };
  category: { name: string } | null;
  flags: Array<{ id: string }>;
};

const STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "NEEDS_MORE_INFO",
  "REIMBURSED",
  "PAID",
  "ARCHIVED",
];

export function ExpenseList({
  items,
  categories,
}: {
  items: ExpenseRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [filterName, setFilterName] = useState("");

  function applyFilters(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.set("view", "list");
    startTransition(() => {
      router.push(`/finance/expenses?${params.toString()}`);
    });
  }

  async function saveFilter() {
    if (!filterName.trim()) {
      toast.error("Name your saved filter");
      return;
    }
    const filters = Object.fromEntries(searchParams.entries());
    const res = await fetch("/api/expenses/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: filterName, filters }),
    });
    if (!res.ok) {
      toast.error("Could not save filter");
      return;
    }
    toast.success("Filter saved");
    setFilterName("");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4 xl:grid-cols-6">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search merchant, notes…"
          className="h-11 rounded-xl md:col-span-2"
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters({ q });
          }}
        />
        <Select
          value={searchParams.get("status") ?? undefined}
          onValueChange={(v) => applyFilters({ status: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("categoryId") ?? undefined}
          onValueChange={(v) => applyFilters({ categoryId: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("receiptExists") ?? undefined}
          onValueChange={(v) => applyFilters({ receiptExists: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Receipt" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Receipt any</SelectItem>
            <SelectItem value="true">Has receipt</SelectItem>
            <SelectItem value="false">No receipt</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("flagged") ?? undefined}
          onValueChange={(v) => applyFilters({ flagged: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Flags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Flags any</SelectItem>
            <SelectItem value="true">Flagged only</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2 md:col-span-2 xl:col-span-2">
          <Button className="h-11 rounded-xl" disabled={pending} onClick={() => applyFilters({ q })}>
            Filter
          </Button>
          <Input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Save as…"
            className="h-11 rounded-xl"
          />
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => void saveFilter()}>
            Save
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No expenses match these filters.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <Link href={`/finance/expenses/${item.id}`} className="font-medium text-slate-900">
                        {item.merchant}
                      </Link>
                      {item.missingReceipt ? (
                        <span className="ml-2 text-xs text-amber-700">Missing receipt</span>
                      ) : null}
                      {item.flags.length ? (
                        <span className="ml-2 text-xs text-red-600">Flagged</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.employee.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.category?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(item.purchaseDate)}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(Number(item.total))}</td>
                    <td className="px-4 py-3">
                      <ExpenseStatusBadge status={item.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
