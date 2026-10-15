import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { requirePermission } from "@/lib/auth";
import { requireModule } from "@/lib/access-control";
import { PERMISSIONS } from "@/lib/permissions";

export type ProjectCustomerOption = { id: string; name: string };

const RESULT_LIMIT = 15;

/**
 * Directory search for the project form.
 * Scoped to the caller's business. Returns names only — email can be matched, never returned.
 */
export async function searchProjectCustomers(ctx: AuthContext, query: string): Promise<ProjectCustomerOption[]> {
  await requireModule(ctx, "PROJECTS");
  await requirePermission(ctx, PERMISSIONS.CREATE_DOCUMENTS);

  const tokens = query.trim().slice(0, 80).split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = await db.customer.findMany({
    where: {
      businessId: ctx.business.id,
      deletedAt: null,
      ...(tokens.length
        ? {
            AND: tokens.map((token) => ({
              OR: [
                { firstName: { contains: token, mode: "insensitive" as const } },
                { lastName: { contains: token, mode: "insensitive" as const } },
                { email: { contains: token, mode: "insensitive" as const } },
              ],
            })),
          }
        : {}),
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: RESULT_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    name: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "Customer",
  }));
}
