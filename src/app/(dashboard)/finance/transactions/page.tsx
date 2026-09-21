import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canEditBankTransactions, canViewBankTransactions } from "@/lib/banking/access";
import { listBankCenter } from "@/lib/banking/banking-service";
import { TransactionsClient } from "@/components/banking/transactions-client";

export const metadata = { title: "Bank transactions" };

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; accountId?: string; categoryId?: string; q?: string; personal?: string; page?: string }>;
}) {
  const ctx = await requireAuth();
  if (!canViewBankTransactions(ctx)) redirect("/dashboard");
  const params = await searchParams;
  const personal = params.personal === "personal" || params.personal === "business" ? params.personal : "all";
  const page = Number(params.page);
  const data = await listBankCenter(ctx, {
    from: params.from,
    to: params.to,
    accountId: params.accountId,
    categoryId: params.categoryId,
    q: params.q,
    personal,
    page: Number.isFinite(page) ? page : 1,
  });
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.accountId) query.set("accountId", params.accountId);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.q) query.set("q", params.q);
  if (personal !== "all") query.set("personal", personal);
  const previous = new URLSearchParams(query);
  const next = new URLSearchParams(query);
  if (data.page > 2) previous.set("page", String(data.page - 1));
  else previous.delete("page");
  next.set("page", String(data.page + 1));
  return (
    <TransactionsClient
      data={data}
      canEdit={canEditBankTransactions(ctx)}
      previousHref={data.page > 1 ? `/finance/transactions?${previous.toString()}` : null}
      nextHref={data.hasMore ? `/finance/transactions?${next.toString()}` : null}
    />
  );
}
