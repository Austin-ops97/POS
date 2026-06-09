import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CustomersTable } from "@/components/dashboard/customers-table";

export default async function CustomersPage() {
  const ctx = await requireAuth();
  const businessId = ctx.business.id;

  const customers = await db.customer.findMany({
    where: { businessId, deletedAt: null },
    include: {
      orders: {
        where: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
        select: { total: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const customerRows = customers.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
    email: c.email,
    phone: c.phone,
    orderCount: c.orders.length,
    totalSpent: c.orders.reduce((sum, o) => sum + Number(o.total), 0),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <p className="text-sm text-slate-500">
          Manage customer profiles and history
        </p>
      </div>
      <CustomersTable customers={customerRows} />
    </div>
  );
}
