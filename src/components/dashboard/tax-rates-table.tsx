"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TaxRatesTable({ taxRates }: { taxRates: Array<{ id: string; name: string; rate: unknown; isActive: boolean }> }) {
  const router = useRouter();
  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}?`)) return;
    const res = await fetch(`/api/tax-rates/${id}`, { method: "DELETE" });
    if (!res.ok) { const body = await res.json().catch(() => null); toast.error(body?.error ?? "Failed to delete tax rate"); return; }
    toast.success("Tax rate deleted"); router.refresh();
  }
  return <Card><CardHeader><CardTitle>Active Tax Rates</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="pb-3 font-medium">Name</th><th className="pb-3 font-medium">Rate</th><th className="pb-3 font-medium">Status</th><th className="pb-3 text-right font-medium">Actions</th></tr></thead><tbody>{taxRates.map((tax) => <tr key={tax.id} className="border-b border-slate-100"><td className="py-3 font-medium text-slate-900">{tax.name}</td><td className="py-3 text-slate-600">{(Number(tax.rate) * 100).toFixed(2)}%</td><td className="py-3"><Badge variant={tax.isActive ? "success" : "secondary"}>{tax.isActive ? "Active" : "Inactive"}</Badge></td><td className="py-3 text-right"><Button variant="ghost" size="icon" onClick={() => remove(tax.id, tax.name)}><Trash2 className="h-4 w-4 text-red-600" /></Button></td></tr>)}</tbody></table></CardContent></Card>;
}
