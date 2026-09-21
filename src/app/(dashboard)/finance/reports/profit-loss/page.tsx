import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canViewProfitAndLoss } from "@/lib/banking/access";
import { profitAndLossReport } from "@/lib/banking/banking-service";
import { ProfitLossClient } from "@/components/banking/profit-loss-client";

export const metadata = { title: "Profit and loss" };

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; category?: string }>;
}) {
  const ctx = await requireAuth();
  if (!canViewProfitAndLoss(ctx)) redirect("/dashboard");
  const params = await searchParams;
  const report = await profitAndLossReport(ctx, params);
  return <ProfitLossClient report={report} />;
}
