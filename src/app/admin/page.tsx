import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
  await requirePlatformAdmin();
  const businesses = await db.business.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { employees: true, locations: true, orders: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Businesses</h1><p className="text-slate-500">Your customers, licensing, and account status.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {businesses.map((business) => (
          <Link href={`/admin/businesses/${business.id}`} key={business.id}>
            <Card className="h-full transition hover:border-slate-400">
              <CardHeader><CardTitle className="flex justify-between gap-3"><span>{business.name}</span><span className="text-xs font-medium text-slate-500">{business.status}</span></CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-500">{business._count.employees} employees · {business._count.locations} locations · {business._count.orders} orders</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
