import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/demo-mode";
import { DEMO_LOCATION_ID } from "@/lib/demo-data";
import { EmployeeForm } from "@/components/dashboard/employee-form";
import { Button } from "@/components/ui/button";

export default async function NewEmployeePage() {
  const ctx = await requireAuth();

  let roles: Array<{ id: string; name: string }>;
  let locations: Array<{ id: string; name: string }>;

  if (isDemoMode()) {
    roles = [
      { id: "demo-role-owner", name: "Owner" },
      { id: "demo-role-manager", name: "Manager" },
      { id: "demo-role-cashier", name: "Cashier" },
    ];
    locations = [{ id: DEMO_LOCATION_ID, name: "Main Store" }];
  } else {
    [roles, locations] = await Promise.all([
      db.role.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.location.findMany({
        where: {
          businessId: ctx.business.id,
          deletedAt: null,
          isActive: true,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/employees">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add Employee</h1>
          <p className="text-sm text-slate-500">
            Create a new team member profile
          </p>
        </div>
      </div>
      <EmployeeForm roles={roles} locations={locations} />
    </div>
  );
}
