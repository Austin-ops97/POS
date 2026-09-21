import { hasAnyPermission, hasPermission, type AuthContext } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export function canManageSocial(ctx: AuthContext): boolean {
  return hasPermission(ctx, PERMISSIONS.MANAGE_SOCIAL);
}

export function canPublishSocial(ctx: AuthContext): boolean {
  return hasPermission(ctx, PERMISSIONS.PUBLISH_SOCIAL);
}

export function canViewSocial(ctx: AuthContext): boolean {
  return hasAnyPermission(ctx, [PERMISSIONS.MANAGE_SOCIAL, PERMISSIONS.PUBLISH_SOCIAL]);
}
