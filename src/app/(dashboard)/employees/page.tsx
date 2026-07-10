import { requireAuth } from "@/lib/auth";
import { getEmployees } from "@/lib/queries";
import { EmployeesTable } from "@/components/dashboard/employees-table";

export default async function EmployeesPage() {
  const ctx = await requireAuth();
  const employees = await getEmployees(ctx);

  const rows = employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    email: emp.email,
    status: emp.status,
    hourlyWage:
      "hourlyWage" in emp && emp.hourlyWage != null
        ? Number(emp.hourlyWage)
        : null,
    role: emp.role,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
        <p className="text-sm text-slate-500">
          Manage team members, wages, roles, and PIN access
        </p>
      </div>
      <EmployeesTable employees={rows} />
    </div>
  );
}
