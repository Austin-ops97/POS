import { db } from "@/lib/db";

export type ProjectCustomerOption = { id: string; name: string };

/** Names only, scoped to the caller's business, for the project create form. */
export async function listProjectCustomerOptions(businessId: string): Promise<ProjectCustomerOption[]> {
  const rows = await db.customer.findMany({
    where: { businessId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  return rows.map((row) => ({
    id: row.id,
    name: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || "Customer",
  }));
}
