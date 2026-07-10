import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { getEmployeeById } from "@/lib/queries";
import { db } from "@/lib/db";
import { EmployeeForm } from "@/components/dashboard/employee-form";
import { Button } from "@/components/ui/button";
import { PERMISSIONS } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function EmployeeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAuth();

  if (!hasPermission(ctx, PERMISSIONS.MANAGE_EMPLOYEES)) {
    redirect("/employees");
  }

  const employee = await getEmployeeById(ctx, id);
  if (!employee) notFound();

  const [roles, locations] = await Promise.all([
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const locationIds =
    "locations" in employee
      ? (employee.locations as Array<{ location: { id: string } }>).map(
          (l) => l.location.id
        )
      : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/employees/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Employee</h1>
          <p className="text-sm text-slate-500">{employee.name}</p>
        </div>
      </div>

      <EmployeeForm
        employeeId={id}
        roles={roles}
        locations={locations}
        defaultValues={{
          name: employee.name,
          email: employee.email,
          phone: employee.phone ?? "",
          roleId: employee.role.id,
          locationIds,
          hourlyWage: employee.hourlyWage ? Number(employee.hourlyWage) : undefined,
          ptoAnnualHours: Number(employee.ptoAnnualHours ?? 0),
          ptoBalanceHours: Number(employee.ptoBalanceHours ?? 0),
          status: employee.status as "ACTIVE" | "INACTIVE" | "INVITED",
        }}
      />
    </div>
  );
}
