import { requireAuth } from "@/lib/auth";
import { getReportsData } from "@/lib/queries";
import { ReportsContent } from "@/components/dashboard/reports-content";


export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireAuth();
  const data = await getReportsData(ctx);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Sales analytics and business insights</p>
      </div>
      <ReportsContent {...data} />
    </div>
  );
}
