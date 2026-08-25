"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { customerSchema } from "@/lib/validations";
import {
  beginExclusiveSubmit,
  createCustomerPayload,
  customerDisplayName,
  endExclusiveSubmit,
  parseCreatedCustomer,
  type CustomerFormValues,
  type RegisterCustomer,
} from "@/lib/register/customer";

export type CustomerOption = RegisterCustomer;

type CustomerPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: CustomerOption) => void;
  onClear?: () => void;
  hasCustomer?: boolean;
};

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
  const [mode, setMode] = useState<"search" | "create">("search");
  const submitLock = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      setMode("search");
      reset();
      submitLock.current = false;
      return;
    }

    if (mode !== "search") return;

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
  }, [open, query, mode, reset]);

  async function onCreate(values: CustomerFormValues) {
    if (!beginExclusiveSubmit(submitLock)) return;
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createCustomerPayload(values)),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to create customer");
        toast.error(body?.error ?? "Failed to create customer");
        return;
      }
      const created = parseCreatedCustomer(body);
      if (!created) {
        setError("Customer was created but could not be attached to this sale");
        return;
      }
      onSelect(created);
      onOpenChange(false);
      toast.success(`${customerDisplayName(created)} added to this sale`);
    } catch {
      setError("Failed to create customer");
      toast.error("Failed to create customer");
    } finally {
      endExclusiveSubmit(submitLock);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create customer" : "Select customer"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a customer to this sale without leaving the Register."
              : "Search by name, email, or phone, then choose a customer or create a new one."}
          </DialogDescription>
        </DialogHeader>
        {mode === "create" ? (
          <form className="space-y-4" onSubmit={handleSubmit(onCreate)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="register-customer-firstName">First name</Label>
                <Input id="register-customer-firstName" autoFocus {...register("firstName")} />
                {errors.firstName ? (
                  <p className="text-sm text-red-600" role="alert">
                    {errors.firstName.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-customer-lastName">Last name</Label>
                <Input id="register-customer-lastName" {...register("lastName")} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="register-customer-email">Email</Label>
                <Input id="register-customer-email" type="email" {...register("email")} />
                {errors.email ? (
                  <p className="text-sm text-red-600" role="alert">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-customer-phone">Phone</Label>
                <Input id="register-customer-phone" type="tel" {...register("phone")} />
              </div>
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Creating..." : "Create customer"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={isSubmitting}
                onClick={() => {
                  setMode("search");
                  setError(null);
                }}
              >
                Back to search
              </Button>
            </div>
          </form>
        ) : (
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
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setMode("create");
                setError(null);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Create customer
            </Button>
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
                  No customers found. Create a customer to attach them to this sale.
                </li>
              ) : (
                results.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
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
                          {customerDisplayName(c)}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
