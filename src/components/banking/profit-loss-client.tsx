"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#0f172a", "#047857", "#334155", "#0f766e", "#64748b", "#94a3b8", "#1e3a5f"];

type Item = { id: string; date: string; description: string; amount: number; kind: string };
type Line = { label: string; total: number; ids: string[]; items: Item[] };

export type ProfitAndLossView = {
  preset: string;
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
  incomeLines: Line[];
  expenseLines: Line[];
  selectedCategory: string | null;
  truncated: boolean;
};

const PRESETS = [
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
  ["ytd", "Year to date"],
] as const;

export function ProfitLossClient({ report }: { report: ProfitAndLossView }) {
  const router = useRouter();
  const selected = report.expenseLines.find((line) => line.label === report.selectedCategory) ?? null;
  const comparison = [
    { name: "Income", total: report.income },
    { name: "Expenses", total: report.expenses },
  ];

  function openCategory(label: string) {
    const params = new URLSearchParams({ preset: report.preset, from: report.from, to: report.to });
    if (report.selectedCategory !== label) params.set("category", label);
    router.push(`/finance/reports/profit-loss?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Profit and loss</h1>
        <p className="mt-1 text-sm text-slate-500">{report.from} to {report.to}. Net is income minus expenses. Personal bank rows and bank rows already matched to an expense are left out.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {PRESETS.map(([preset, label]) => (
          <a key={preset} href={`/finance/reports/profit-loss?preset=${preset}`} className={`rounded-full px-3 py-1.5 text-sm ${report.preset === preset ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
            {label}
          </a>
        ))}
      </div>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" action="/finance/reports/profit-loss">
        <input type="hidden" name="preset" value="custom" />
        <label className="text-sm text-slate-600">From <input className="mt-1 block h-11 rounded-xl border border-slate-200 px-3" type="date" name="from" defaultValue={report.from} /></label>
        <label className="text-sm text-slate-600">To <input className="mt-1 block h-11 rounded-xl border border-slate-200 px-3" type="date" name="to" defaultValue={report.to} /></label>
        <button className="h-11 rounded-xl bg-slate-900 px-4 text-sm text-white" type="submit">Custom range</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Total label="Income" value={report.income} />
        <Total label="Expenses" value={report.expenses} />
        <Total label="Net" value={report.net} />
      </div>
      {report.truncated ? <p className="text-sm text-amber-800">This range was limited to the first 2,000 orders, expenses, and bank transactions. Narrow the dates for a complete total.</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Income vs expenses</h2>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  <Cell fill="#047857" />
                  <Cell fill="#0f172a" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Expenses by category</h2>
          {report.expenseLines.length === 0 ? <p className="mt-6 text-sm text-slate-500">No expenses in this range.</p> : (
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={report.expenseLines} dataKey="total" nameKey="label" innerRadius={55} outerRadius={90} onClick={(_, index) => { const line = report.expenseLines[index]; if (line) openCategory(line.label); }}>
                    {report.expenseLines.map((line, index) => <Cell key={line.label} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LineList title="Income" lines={report.incomeLines} onOpen={openCategory} />
        <LineList title="Expenses" lines={report.expenseLines} onOpen={openCategory} />
      </div>

      {selected ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">{selected.label}</h2>
          {selected.items.length === 0 ? <p className="mt-2 text-sm text-slate-500">No underlying rows in this slice.</p> : (
            <ul className="mt-3 divide-y divide-slate-100">
              {selected.items.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:justify-between">
                  <span>{item.date} · {item.description}</span>
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <a className="mt-3 inline-block text-sm text-emerald-700 underline" href={`/finance/transactions?from=${report.from}&to=${report.to}`}>Open bank transactions in this range</a>
        </section>
      ) : null}
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{formatCurrency(value)}</p>
    </div>
  );
}

function LineList({ title, lines, onOpen }: { title: string; lines: Line[]; onOpen: (label: string) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {lines.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing in this range.</p> : (
        <ul className="mt-2 divide-y divide-slate-100">
          {lines.map((line) => (
            <li key={line.label}>
              <button type="button" className="flex w-full items-center justify-between py-2 text-left text-sm" onClick={() => onOpen(line.label)}>
                <span>{line.label} · {line.ids.length}</span>
                <span className="font-medium">{formatCurrency(line.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
