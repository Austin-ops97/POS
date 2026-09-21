import { hasAnyPermission, type AuthContext } from "@/lib/auth";
import { canManageBankStatements } from "@/lib/expenses/bank-statement-service";
import { PERMISSIONS } from "@/lib/permissions";

export function canConnectBank(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [PERMISSIONS.MANAGE_LOCATIONS, PERMISSIONS.MANAGE_STRIPE]);
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
  return canManageBankStatements(ctx);
}

export function canViewProfitAndLoss(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [PERMISSIONS.VIEW_EXPENSE_REPORTS, PERMISSIONS.VIEW_REPORTS]);
}

export function canExportTaxSummary(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [PERMISSIONS.EXPORT_EXPENSES, PERMISSIONS.VIEW_EXPENSE_REPORTS]);
}
