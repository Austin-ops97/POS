"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

type Item = { id: string; date: string; description: string; amount: number; kind: string };
type Row = {
  categoryId: string | null;
  category: string;
  taxLabel: string;
  count: number;
  total: number;
  withReceipt: number;
  missingReceipts: number;
  items: Item[];
};

export type TaxSummaryView = {
  preset: string;
  from: string;
  to: string;
  disclaimer: string;
  rows: Row[];
  categories: { id: string; name: string; taxLabel: string }[];
  truncated: boolean;
};

export function TaxSummaryClient({ report, canExport, canEdit }: { report: TaxSummaryView; canExport: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = `preset=${encodeURIComponent(report.preset)}&from=${encodeURIComponent(report.from)}&to=${encodeURIComponent(report.to)}`;

  async function saveMapping(form: FormData) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/finance/tax-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: String(form.get("categoryId") || ""), taxLabel: String(form.get("taxLabel") || "") }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "Could not save the label");
      toast.error(body?.error ?? "Could not save the label");
      return;
    }
    toast.success("Label saved");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Reports</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Tax summary</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{report.disclaimer}</p>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" action="/finance/reports/tax">
        <input type="hidden" name="preset" value="custom" />
        <label className="text-sm text-slate-600">From <input className="mt-1 block h-11 rounded-xl border border-slate-200 px-3" type="date" name="from" defaultValue={report.from} /></label>
        <label className="text-sm text-slate-600">To <input className="mt-1 block h-11 rounded-xl border border-slate-200 px-3" type="date" name="to" defaultValue={report.to} /></label>
        <button className="h-11 rounded-xl bg-slate-900 px-4 text-sm text-white" type="submit">Apply</button>
        <a className="text-sm text-emerald-700 underline" href="/finance/reports/tax?preset=ytd">Year to date</a>
        <a className="text-sm text-emerald-700 underline" href="/finance/reports/tax?preset=year">This year</a>
      </form>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {report.truncated ? <p className="text-sm text-amber-800">This range was limited to 2,000 expenses and 2,000 bank withdrawals.</p> : null}

      {canExport ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild variant="outline"><a href={`/api/finance/tax-summary?${query}&format=csv`}>Export CSV</a></Button>
          <Button asChild variant="outline"><a href={`/api/finance/tax-summary?${query}&format=xlsx`}>Export Excel</a></Button>
          <Button asChild variant="outline"><a href={`/api/finance/tax-summary?${query}&format=pdf`}>Export PDF</a></Button>
          <Button asChild variant="outline"><a href={`/api/finance/tax-summary?${query}&format=receipts`}>Export receipts</a></Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Transactions</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">With receipt</th>
              <th className="px-4 py-3 font-medium">Missing receipts</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-slate-500" colSpan={6}>No approved expenses or business bank withdrawals in this range.</td></tr>
            ) : report.rows.map((row) => (
              <tr key={row.categoryId ?? "uncategorized"} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <button type="button" className="font-medium text-slate-900 underline" onClick={() => setOpen(open === row.category ? null : row.category)}>{row.category}</button>
                </td>
                <td className="px-4 py-3">{row.taxLabel}</td>
                <td className="px-4 py-3">{row.count}</td>
                <td className="px-4 py-3">{formatCurrency(row.total)}</td>
                <td className="px-4 py-3">{row.withReceipt}</td>
                <td className="px-4 py-3">{row.missingReceipts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">{open}</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {(report.rows.find((row) => row.category === open)?.items ?? []).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:justify-between">
                <span>{item.date} · {item.description}</span>
                <span>{formatCurrency(item.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canEdit ? (
        <form
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void saveMapping(new FormData(event.currentTarget));
          }}
        >
          <label className="text-sm text-slate-600">Category
            <select name="categoryId" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3" defaultValue={report.categories[0]?.id ?? ""}>
              {report.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">Your label
            <Input className="mt-1" name="taxLabel" placeholder="Vehicle costs" />
          </label>
          <Button type="submit" disabled={busy || report.categories.length === 0}>{busy ? "Saving…" : "Save label"}</Button>
          <p className="text-xs text-slate-500 sm:col-span-3">Labels are for your records. EmeraldOne does not decide whether a cost is deductible.</p>
        </form>
      ) : null}
    </div>
  );
}
