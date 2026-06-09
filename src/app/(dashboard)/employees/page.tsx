import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { UserCog, UserPlus } from "lucide-react";
import { getEmployeeStatusVariant } from "@/lib/status-utils";

export default async function EmployeesPage() {
  const ctx = await requireAuth();

  const employees = await db.employeeProfile.findMany({
    where: { businessId: ctx.business.id, deletedAt: null },
    include: { role: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">
            Manage team members and permissions
          </p>
        </div>
        <Button>
          <UserPlus className="h-4 w-4" />
          Invite Employee
        </Button>
      </div>

      {employees.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No employees yet"
          description="Invite team members to help run your business."
          actionLabel="Invite Employee"
          actionHref="/employees"
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{employee.name}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{employee.role.name}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getEmployeeStatusVariant(employee.status)}>
                      {employee.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
