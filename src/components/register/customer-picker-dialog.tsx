"use client";

import { useEffect, useState } from "react";
import { Search, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CustomerOption = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type CustomerPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: CustomerOption) => void;
  onClear?: () => void;
  hasCustomer?: boolean;
};

function displayName(c: CustomerOption) {
  return `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}`;
}

export function CustomerPickerDialog({
  open,
  onOpenChange,
  onSelect,
  onClear,
  hasCustomer,
}: CustomerPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "20" });
        if (query.trim()) params.set("search", query.trim());
        const res = await fetch(`/api/customers?${params}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.customers || data || []);
      } catch {
        setError("Failed to search customers");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [open, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select customer</DialogTitle>
          <DialogDescription>
            Search by name, email, or phone, then choose a customer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers..."
              className="pl-9"
              autoFocus
            />
          </div>
          {hasCustomer && onClear ? (
            <Button type="button" variant="outline" className="w-full" onClick={onClear}>
              Remove customer from cart
            </Button>
          ) : null}
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <ul className="max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label="Customers">
            {loading ? (
              <li className="px-2 py-6 text-center text-sm text-slate-500">Searching…</li>
            ) : results.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-slate-500">
                No customers found
              </li>
            ) : (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-100"
                    onClick={() => {
                      onSelect(c);
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <User className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">
                        {displayName(c)}
                      </span>
                      <span className="block truncate text-sm text-slate-500">
                        {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
