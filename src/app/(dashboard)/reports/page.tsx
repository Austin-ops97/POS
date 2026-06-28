import { requireAuth } from "@/lib/auth";
import { getReportsData } from "@/lib/queries";
import { getSubscriptionForBusiness } from "@/lib/subscription-server";
import { canAccessAdvancedReports } from "@/lib/subscription-access";
import { ReportsContent } from "@/components/dashboard/reports-content";

export default async function ReportsPage() {
  const ctx = await requireAuth();
  const subscription = await getSubscriptionForBusiness(ctx.business.id);
  const advancedReports = subscription
    ? canAccessAdvancedReports(subscription.plan)
    : false;
  const data = await getReportsData(ctx, { includeAdvanced: advancedReports });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Sales analytics and business insights</p>
      </div>
      <ReportsContent {...data} advancedReports={advancedReports} />
    </div>
  );
}
