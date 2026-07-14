import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmployeeForm } from "@/components/dashboard/employee-form";
import { Button } from "@/components/ui/button";

export default async function NewEmployeePage() {
  const ctx = await requireAuth();

  const [roles, locations] = await Promise.all([
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
