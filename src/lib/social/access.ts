import { hasAnyPermission, type AuthContext } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export function canManageSocial(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [PERMISSIONS.MANAGE_LOCATIONS, PERMISSIONS.MANAGE_STRIPE]);
}
