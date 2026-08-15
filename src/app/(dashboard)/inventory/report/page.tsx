import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { InventoryReportClient } from "@/components/dashboard/inventory-report-client";

export default async function InventoryReportPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.VIEW_INVENTORY)) return null;
  return <div className="space-y-6"><div className="flex items-center gap-4"><Link href="/inventory"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link><div><h1 className="text-2xl font-bold">Inventory financial report</h1><p className="text-sm text-slate-500">Quantity, reorder status, cost, value, and margin</p></div></div><InventoryReportClient /></div>;
}
