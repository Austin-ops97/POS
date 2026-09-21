import { hasAnyPermission, hasPermission, type AuthContext } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export function canOpenImport(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [
    PERMISSIONS.MANAGE_LOCATIONS,
    PERMISSIONS.MANAGE_CUSTOMERS,
    PERMISSIONS.MANAGE_PRODUCTS,
    PERMISSIONS.MANAGE_EXPENSE_SETTINGS,
    PERMISSIONS.APPROVE_EXPENSES,
  ]);
}

export function canConnectQuickBooks(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [PERMISSIONS.MANAGE_LOCATIONS, PERMISSIONS.MANAGE_STRIPE]);
}

export function assertImportEntity(ctx: AuthContext, entityType: string) {
  if (entityType === "CUSTOMER" && !hasPermission(ctx, PERMISSIONS.MANAGE_CUSTOMERS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_CUSTOMERS}`);
  }
  if (entityType === "PRODUCT" && !hasPermission(ctx, PERMISSIONS.MANAGE_PRODUCTS)) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_PRODUCTS}`);
  }
  if ((entityType === "VENDOR" || entityType === "EXPENSE") && !hasAnyPermission(ctx, [PERMISSIONS.MANAGE_EXPENSE_SETTINGS, PERMISSIONS.APPROVE_EXPENSES])) {
    throw new Error(`Missing permission: ${PERMISSIONS.MANAGE_EXPENSE_SETTINGS}`);
  }
}
