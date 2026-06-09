import { requireAuth } from "@/lib/auth";
import { getCustomers, getOrders } from "@/lib/queries";
import { CustomersTable } from "@/components/dashboard/customers-table";

export default async function CustomersPage() {
  const ctx = await requireAuth();
  const [customers, orders] = await Promise.all([getCustomers(ctx), getOrders(ctx)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <p className="text-sm text-slate-500">Manage customer profiles and history</p>
      </div>
      <CustomersTable
        customers={customers.map((c: {
          id: string;
          firstName: string;
          lastName?: string | null;
          email?: string | null;
          phone?: string | null;
        }) => {
          const custOrders = (orders as Array<{ customerId?: string | null; status: string; total: unknown }>).filter(
            (o) => o.customerId === c.id && (o.status === "PAID" || o.status === "PARTIALLY_REFUNDED")
          );
          return {
            id: c.id,
            name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
            email: c.email ?? null,
            phone: c.phone ?? null,
            orderCount: custOrders.length,
            totalSpent: custOrders.reduce((sum, o) => sum + Number(o.total), 0),
          };
        })}
      />
    </div>
  );
}
