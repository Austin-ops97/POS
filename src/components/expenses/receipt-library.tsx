"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type ReceiptRow = {
  id: string;
  merchant: string;
  total: number;
  purchaseDate: string;
  receiptNumber: string | null;
  project: string | null;
  employee: { id: string; name: string };
  category: { id: string; name: string } | null;
  companyCard: { name: string; lastFour: string } | null;
  location: { name: string } | null;
  receipt: { id: string; fileName: string; kind: string } | null;
  receiptCount: number;
};

type Option = { id: string; name: string };

function downloadErrorMessage(payload: { error?: string; fieldErrors?: Record<string, string[]> }) {
  if (payload.error && payload.error !== "Validation error") return payload.error;
  const details = Object.values(payload.fieldErrors ?? {})
    .flat()
    .filter(Boolean);
  if (details.length) return details.join(". ");
  return payload.error || "Download failed";
}

export function ReceiptLibrary({
  categories,
  employees,
  cards,
  locations,
  canChooseEmployee,
}: {
  categories: Option[];
  employees: Option[];
  cards: Option[];
  locations: Option[];
  canChooseEmployee: boolean;
}) {
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    merchant: "",
    minAmount: "",
    maxAmount: "",
    employeeId: "",
    categoryId: "",
    project: "",
    companyCardId: "",
    receiptNumber: "",
    locationId: "",
    q: "",
  });
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [searched, setSearched] = useState(false);

  const selectedIds = useMemo(
    () => rows.flatMap((row) => (selected.includes(row.id) && row.receipt ? [row.receipt.id] : [])),
    [rows, selected]
  );

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function search() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      const response = await fetch(`/api/expenses/receipts/search?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? "Receipt search failed");
        return;
      }
      setRows(payload.items ?? []);
      setSelected([]);
      setSearched(true);
    } catch {
      toast.error("Receipt search failed");
    } finally {
      setLoading(false);
    }
  }

  async function download(allFiltered: boolean) {
    setDownloading(true);
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value.trim() !== "")
      );
      const response = await fetch("/api/expenses/receipts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allFiltered,
          ...(allFiltered ? {} : { receiptIds: selectedIds }),
          includeCsv: true,
          filters: activeFilters,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          fieldErrors?: Record<string, string[]>;
        };
        toast.error(downloadErrorMessage(payload));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "emeraldone-receipts.zip";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Receipt archive downloaded");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Receipts</h1>
        <p className="text-sm text-slate-500">Search captured receipts and download a ZIP with a CSV index.</p>
      </div>
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="dateFrom">From</Label>
          <Input id="dateFrom" type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="dateTo">To</Label>
          <Input id="dateTo" type="date" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="merchant">Merchant</Label>
          <Input id="merchant" value={filters.merchant} onChange={(event) => setFilter("merchant", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="q">OCR text</Label>
          <Input id="q" value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="Search receipt text" />
        </div>
        <div>
          <Label htmlFor="minAmount">Min amount</Label>
          <Input id="minAmount" type="number" step="0.01" value={filters.minAmount} onChange={(event) => setFilter("minAmount", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="maxAmount">Max amount</Label>
          <Input id="maxAmount" type="number" step="0.01" value={filters.maxAmount} onChange={(event) => setFilter("maxAmount", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="receiptNumber">Receipt number</Label>
          <Input id="receiptNumber" value={filters.receiptNumber} onChange={(event) => setFilter("receiptNumber", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="project">Project</Label>
          <Input id="project" value={filters.project} onChange={(event) => setFilter("project", event.target.value)} />
        </div>
        <div>
          <Label htmlFor="categoryId">Category</Label>
          <select id="categoryId" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-2 text-sm" value={filters.categoryId} onChange={(event) => setFilter("categoryId", event.target.value)}>
            <option value="">Any</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        {canChooseEmployee ? (
          <div>
            <Label htmlFor="employeeId">Employee</Label>
            <select id="employeeId" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-2 text-sm" value={filters.employeeId} onChange={(event) => setFilter("employeeId", event.target.value)}>
              <option value="">Any</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </div>
        ) : null}
        <div>
          <Label htmlFor="companyCardId">Payment account</Label>
          <select id="companyCardId" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-2 text-sm" value={filters.companyCardId} onChange={(event) => setFilter("companyCardId", event.target.value)}>
            <option value="">Any</option>
            {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="locationId">Location</Label>
          <select id="locationId" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-2 text-sm" value={filters.locationId} onChange={(event) => setFilter("locationId", event.target.value)}>
            <option value="">Any</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void search()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
        <Button type="button" variant="outline" disabled={downloading || selectedIds.length === 0} onClick={() => void download(false)}>
          <Download className="h-4 w-4" />
          Download selected
        </Button>
        <Button type="button" variant="outline" disabled={downloading || rows.length === 0} onClick={() => void download(true)}>
          <Download className="h-4 w-4" />
          Download all filtered
        </Button>
      </div>
      {searched && rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No receipts match those filters.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    aria-label="Select all receipts"
                    checked={selected.length === rows.length}
                    onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.id) : [])}
                  />
                </th>
                <th className="p-3">Date</th>
                <th className="p-3">Merchant</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Employee</th>
                <th className="p-3">Category</th>
                <th className="p-3">Project</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.merchant}`}
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)
                        )
                      }
                    />
                  </td>
                  <td className="p-3">{row.purchaseDate}</td>
                  <td className="p-3 font-medium">{row.merchant}{row.receiptNumber ? <span className="block text-xs text-slate-500">#{row.receiptNumber}</span> : null}</td>
                  <td className="p-3">{formatCurrency(row.total)}</td>
                  <td className="p-3">{row.employee.name}</td>
                  <td className="p-3">{row.category?.name ?? "—"}</td>
                  <td className="p-3">{row.project ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
