"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ReportRow = {
  product: string; sku: string | null; barcode: string | null; location: string;
  quantityOnHand: number; reorderPoint: number; status: string;
  unitCost?: number; salePrice?: number; estimatedInventoryValue?: number; grossProfitPerUnit?: number; marginPercent?: number;
};

export function InventoryReportClient() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [canViewCosts, setCanViewCosts] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/inventory/report").then((res) => res.json()).then((data) => { setRows(data.rows ?? []); setCanViewCosts(Boolean(data.canViewCosts)); }).finally(() => setLoading(false)); }, []);
  return <div className="space-y-4">
    <div className="flex justify-end gap-2 print:hidden"><Button variant="outline" onClick={() => window.open("/api/inventory/report?format=csv", "_blank")}>Export CSV</Button><Button variant="outline" onClick={() => window.print()}>Print report</Button></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left"><th className="p-3">Product</th><th className="p-3">SKU / Barcode</th><th className="p-3">Location</th><th className="p-3">Qty</th><th className="p-3">Status</th>{canViewCosts && <><th className="p-3">Unit cost</th><th className="p-3">Sale price</th><th className="p-3">Value</th><th className="p-3">Profit / unit</th><th className="p-3">Margin</th></>}</tr></thead><tbody>{loading ? <tr><td colSpan={canViewCosts ? 10 : 5} className="p-6 text-center">Loading…</td></tr> : rows.map((row) => <tr key={`${row.location}-${row.product}-${row.sku}`} className="border-b"><td className="p-3 font-medium">{row.product}</td><td className="p-3 text-slate-600">{row.sku ?? "—"} / {row.barcode ?? "—"}</td><td className="p-3">{row.location}</td><td className="p-3">{row.quantityOnHand} / {row.reorderPoint}</td><td className={`p-3 ${row.status === "LOW" ? "text-amber-700" : "text-emerald-700"}`}>{row.status}</td>{canViewCosts && <><td className="p-3">${row.unitCost?.toFixed(2)}</td><td className="p-3">${row.salePrice?.toFixed(2)}</td><td className="p-3">${row.estimatedInventoryValue?.toFixed(2)}</td><td className="p-3">${row.grossProfitPerUnit?.toFixed(2)}</td><td className="p-3">{row.marginPercent?.toFixed(1)}%</td></>}</tr>)}</tbody></table>
    </div>
  </div>;
}
