import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canEditBankTransactions, canViewBankTransactions } from "@/lib/banking/access";
import { listBankCenter } from "@/lib/banking/banking-service";
import { TransactionsClient } from "@/components/banking/transactions-client";

export const metadata = { title: "Bank transactions" };

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; accountId?: string; categoryId?: string; q?: string; personal?: string }>;
}) {
  const ctx = await requireAuth();
  if (!canViewBankTransactions(ctx)) redirect("/dashboard");
  const params = await searchParams;
  const personal = params.personal === "personal" || params.personal === "business" ? params.personal : "all";
  const data = await listBankCenter(ctx, {
    from: params.from,
    to: params.to,
    accountId: params.accountId,
    categoryId: params.categoryId,
    q: params.q,
    personal,
  });
  return <TransactionsClient data={data} canEdit={canEditBankTransactions(ctx)} />;
}
