import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import {
  canManageBankStatements,
  listBankStatements,
} from "@/lib/expenses/bank-statement-service";
import { BankStatementsClient } from "@/components/expenses/bank-statements-client";

export default async function BankStatementsPage() {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_OWN_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES) &&
    !hasPermission(ctx, PERMISSIONS.VIEW_EXPENSE_REPORTS)
  ) {
    redirect("/dashboard");
  }

  const statements = await listBankStatements(ctx);
  return (
    <BankStatementsClient
      canUpload={canManageBankStatements(ctx)}
      initialItems={statements.map((item) => ({
        id: item.id,
        title: item.title,
        accountName: item.accountName,
        periodStart: item.periodStart?.toISOString() ?? null,
        periodEnd: item.periodEnd?.toISOString() ?? null,
        notes: item.notes,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt.toISOString(),
        uploadedBy: item.uploadedBy,
      }))}
    />
  );
}
