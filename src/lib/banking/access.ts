import { hasAnyPermission, hasPermission, type AuthContext } from "@/lib/auth";
import { canImportFinancialFiles } from "@/lib/expenses/bank-statement-service";
import { PERMISSIONS } from "@/lib/permissions";

export const BANK_PAGE_SIZE = 50;

export function bankListWindow(page: number | undefined) {
  const current = Number.isFinite(page) ? Math.min(100, Math.max(1, Math.floor(page as number))) : 1;
  return { page: current, skip: (current - 1) * BANK_PAGE_SIZE, take: BANK_PAGE_SIZE + 1 };
}

export function canConnectBank(ctx: AuthContext): boolean {
  return hasPermission(ctx, PERMISSIONS.MANAGE_BANK);
}

export function canViewBankTransactions(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [
    PERMISSIONS.VIEW_EXPENSE_REPORTS,
    PERMISSIONS.VIEW_TEAM_EXPENSES,
    PERMISSIONS.APPROVE_EXPENSES,
    PERMISSIONS.MANAGE_EXPENSE_SETTINGS,
    PERMISSIONS.EXPORT_EXPENSES,
  ]);
}

export function canEditBankTransactions(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [
    PERMISSIONS.APPROVE_EXPENSES,
    PERMISSIONS.MANAGE_EXPENSE_SETTINGS,
    PERMISSIONS.VIEW_EXPENSE_REPORTS,
  ]);
}

export function canImportStatements(ctx: AuthContext): boolean {
  return canImportFinancialFiles(ctx);
}

export function canViewProfitAndLoss(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [PERMISSIONS.VIEW_EXPENSE_REPORTS, PERMISSIONS.VIEW_REPORTS]);
}

export function canExportTaxSummary(ctx: AuthContext): boolean {
  return hasPermission(ctx, PERMISSIONS.EXPORT_EXPENSES);
}
