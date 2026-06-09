import { requireAuth } from "@/lib/auth";
import { getEmployees } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus } from "lucide-react";

export default async function EmployeesPage() {
  const ctx = await requireAuth();
  const employees = await getEmployees(ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">Manage team members and roles</p>
        </div>
        <Button><UserPlus className="h-4 w-4" />Invite Employee</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: { id: string; name: string; email: string; status: string; role: { name: string } }) => (
                <tr key={emp.id} className="border-b border-slate-100">
                  <td className="p-4 font-medium text-slate-900">{emp.name}</td>
                  <td className="p-4 text-slate-600">{emp.email}</td>
                  <td className="p-4 text-slate-600">{emp.role.name}</td>
                  <td className="p-4"><Badge variant="success">{emp.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
