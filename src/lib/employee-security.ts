import { db } from "./db";
import type { AuthContext } from "./auth";

const PRIVILEGED_ROLES = new Set(["Owner", "Admin"]);

export async function assertRoleAssignmentAllowed(ctx: AuthContext, roleId: string) {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true } });
  if (!role) throw new Error("Role not found");
  if (PRIVILEGED_ROLES.has(role.name) && ctx.employee.role.name !== "Owner") {
    throw new Error("Only a business owner can assign Owner or Admin roles");
  }
  return role;
}

export function assertEmployeeManagementAllowed(ctx: AuthContext, targetRoleName: string) {
  if (PRIVILEGED_ROLES.has(targetRoleName) && ctx.employee.role.name !== "Owner") {
    throw new Error("Only a business owner can manage Owner or Admin accounts");
  }
}
