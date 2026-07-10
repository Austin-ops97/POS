"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { UserCog, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatCurrency } from "@/lib/utils";
import { getEmployeeStatusVariant } from "@/lib/status-utils";
import type { EmployeeStatus } from "@prisma/client";

export type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  hourlyWage: number | string | null;
  role: { name: string };
};

export function EmployeesTable({ employees }: { employees: EmployeeRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.role.name.toLowerCase().includes(q)
    );
  }, [employees, search]);

  if (employees.length === 0) {
    return (
      <EmptyState
        icon={UserCog}
        title="No employees yet"
        description="Add team members to manage roles, wages, and time clock access."
        actionLabel="Invite Employee"
        actionHref="/employees/new"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button asChild>
          <Link href="/employees/new">
            <Plus className="h-4 w-4" />
            Invite Employee
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Role</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Wage</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No employees match your search
                </td>
              </tr>
            ) : (
              filtered.map((emp) => (
                <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/employees/${emp.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {emp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{emp.email}</td>
                  <td className="px-4 py-3 text-slate-600">{emp.role.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {emp.hourlyWage != null
                      ? `${formatCurrency(Number(emp.hourlyWage))}/hr`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getEmployeeStatusVariant(emp.status as EmployeeStatus)}>
                      {emp.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
