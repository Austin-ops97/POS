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
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9"
            enterKeyHint="search"
            aria-label="Search employees"
          />
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/employees/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Invite Employee
          </Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
          No employees match your search
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filtered.map((emp) => (
              <li
                key={emp.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/employees/${emp.id}`}
                      className="block truncate font-semibold text-slate-900 hover:underline"
                    >
                      {emp.name}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {emp.role.name} · {emp.email}
                    </p>
                  </div>
                  <Badge variant={getEmployeeStatusVariant(emp.status as EmployeeStatus)}>
                    {emp.status}
                  </Badge>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="min-w-0 text-sm text-slate-600">
                    {emp.hourlyWage != null
                      ? `${formatCurrency(Number(emp.hourlyWage))}/hr`
                      : "No wage set"}
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/employees/${emp.id}`}>View</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full min-w-[640px] text-sm">
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
                {filtered.map((emp) => (
                  <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="max-w-[14rem] px-4 py-3">
                      <Link
                        href={`/employees/${emp.id}`}
                        className="block truncate font-medium text-slate-900 hover:underline"
                      >
                        {emp.name}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-600">
                      {emp.email}
                    </td>
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
