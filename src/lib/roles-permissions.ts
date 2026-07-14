import type { Prisma, PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "./permissions";

type DbClient = PrismaClient | Prisma.TransactionClient;

function formatPermissionName(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Idempotent upsert of system roles, permissions, and role-permission mappings.
 * Safe to call from seed, provisioning, and business creation.
 */
export async function ensureRolesAndPermissions(
  db: DbClient
): Promise<Record<string, string>> {
  const permissionIds: Record<string, string> = {};

  for (const key of Object.values(PERMISSIONS)) {
    const permission = await db.permission.upsert({
      where: { key },
      create: {
        key,
        name: formatPermissionName(key),
        description: `Permission: ${key}`,
      },
      update: {},
    });
    permissionIds[key] = permission.id;
  }

  const roleIds: Record<string, string> = {};

  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { name: roleName },
      create: {
        name: roleName,
        description: `${roleName} role`,
        isSystem: true,
      },
      update: {},
    });
    roleIds[roleName] = role.id;

    for (const permKey of permissionKeys) {
      const permissionId = permissionIds[permKey];
      if (!permissionId) continue;
      await db.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }

  return roleIds;
}
