"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatCurrency } from "@/lib/utils";

export type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
};

export function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );
  }, [customers, search]);

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No customers yet"
        description="Customer profiles will appear as you add them at checkout or here."
        actionLabel="Add Customer"
        actionHref="/customers/new"
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
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9"
            enterKeyHint="search"
            aria-label="Search customers"
          />
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/customers/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Customer
          </Link>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-500">
          No customers match your search.
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filtered.map((customer) => (
              <li
                key={customer.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="block truncate font-semibold text-slate-900 hover:underline"
                  >
                    {customer.name}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {customer.email || customer.phone || "No contact info"}
                  </p>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900">
                      {formatCurrency(customer.totalSpent)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {customer.orderCount}{" "}
                      {customer.orderCount === 1 ? "order" : "orders"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/customers/${customer.id}`}>View</Link>
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
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Phone</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Orders</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr key={customer.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="max-w-[14rem] px-4 py-3">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="block truncate font-medium text-slate-900 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-600">
                      {customer.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{customer.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.orderCount}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatCurrency(customer.totalSpent)}
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
