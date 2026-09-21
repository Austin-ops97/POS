import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canEditBankTransactions, canExportTaxSummary, canViewProfitAndLoss } from "@/lib/banking/access";
import { taxSummaryReport } from "@/lib/banking/banking-service";
import { TaxSummaryClient } from "@/components/banking/tax-summary-client";

export const metadata = { title: "Tax summary" };

export default async function TaxSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const ctx = await requireAuth();
  if (!canViewProfitAndLoss(ctx)) redirect("/dashboard");
  const params = await searchParams;
  const report = await taxSummaryReport(ctx, params);
  return <TaxSummaryClient report={report} canExport={canExportTaxSummary(ctx)} canEdit={canEditBankTransactions(ctx)} />;
}
