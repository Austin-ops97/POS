"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { expenseCreateSchema } from "@/lib/validations/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReceiptCapture, type CapturedReceipt } from "./receipt-capture";
import { AlertTriangle, Loader2, Save, Send } from "lucide-react";

type Option = { id: string; name: string; lastFour?: string; department?: string | null };

type ExpenseFormProps = {
  categories: Option[];
  cards: Option[];
  employees: Option[];
  locations: Option[];
  vendors: Option[];
  defaultEmployeeId: string;
  defaultLocationId?: string | null;
  defaultDepartment?: string | null;
  canAssignEmployee?: boolean;
  expenseId?: string;
  initialValues?: Partial<z.infer<typeof expenseCreateSchema>>;
};

type FormValues = z.infer<typeof expenseCreateSchema>;

export function ExpenseForm({
  categories,
  cards,
  employees,
  locations,
  vendors,
  defaultEmployeeId,
  defaultLocationId,
  defaultDepartment,
  canAssignEmployee,
  expenseId,
  initialValues,
}: ExpenseFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receipts, setReceipts] = useState<CapturedReceipt[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [merchantSuggestions, setMerchantSuggestions] = useState<string[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(expenseCreateSchema),
    defaultValues: {
      merchant: "",
      amount: 0,
      tax: 0,
      tip: 0,
      purchaseDate: new Date().toISOString().slice(0, 10),
      employeeId: defaultEmployeeId,
      locationId: defaultLocationId ?? undefined,
      department: defaultDepartment ?? undefined,
      paymentMethod: "COMPANY_CARD",
      currency: "USD",
      missingReceipt: true,
      tags: [],
      ...initialValues,
    },
  });

  const amount = form.watch("amount") || 0;
  const tax = form.watch("tax") || 0;
  const tip = form.watch("tip") || 0;
  const total = useMemo(
    () => Number((Number(amount) + Number(tax) + Number(tip)).toFixed(2)),
    [amount, tax, tip]
  );

  useEffect(() => {
    setMerchantSuggestions(vendors.map((v) => v.name).slice(0, 12));
  }, [vendors]);

  async function runOcr(text: string) {
    try {
      const res = await fetch("/api/expenses/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "OCR failed");
        return;
      }
      if (data.merchant) form.setValue("merchant", data.merchant, { shouldDirty: true });
      if (data.date) form.setValue("purchaseDate", data.date, { shouldDirty: true });
      if (data.amount != null) form.setValue("amount", data.amount, { shouldDirty: true });
      if (data.tax != null) form.setValue("tax", data.tax, { shouldDirty: true });
      if (data.tip != null) form.setValue("tip", data.tip, { shouldDirty: true });
      if (data.total != null) {
        // Keep tip/tax/amount if present; total is derived in UI
      }
      if (data.categoryId) form.setValue("categoryId", data.categoryId, { shouldDirty: true });
      if (data.cardLast4) {
        const card = cards.find((c) => c.lastFour === data.cardLast4);
        if (card) form.setValue("companyCardId", card.id, { shouldDirty: true });
      }
      if (data.items?.length) {
        form.setValue(
          "lineItems",
          data.items.map((item: { description: string; amount: number; quantity?: number }) => ({
            description: item.description,
            amount: item.amount,
            quantity: item.quantity ?? 1,
          })),
          { shouldDirty: true }
        );
      }
      toast.success(`Receipt parsed (${Math.round(data.confidence ?? 0)}% confidence)`);
    } catch {
      toast.error("Unable to parse receipt text");
    }
  }

  function onReceipt(receipt: CapturedReceipt) {
    setReceipts((prev) => [...prev, receipt]);
    form.setValue("missingReceipt", false, { shouldDirty: true });
  }

  async function save(submit: boolean) {
    const values = form.getValues();
    startTransition(async () => {
      try {
        const payload = {
          ...values,
          total,
          submit,
          missingReceipt: receipts.length === 0,
        };
        const res = await fetch(expenseId ? `/api/expenses/${expenseId}` : "/api/expenses", {
          method: expenseId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to save expense");
          return;
        }

        const id = expenseId ?? data.expense?.id ?? data.id;
        const warn: string[] = [];
        for (const d of data.duplicates ?? []) {
          warn.push(d.message);
        }
        for (const w of data.warnings ?? []) {
          warn.push(w.message);
        }
        setWarnings(warn);

        if (id && receipts.length) {
          for (const receipt of receipts) {
            const upload = await fetch(`/api/expenses/${id}/receipts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(receipt),
            });
            if (!upload.ok) {
              const err = await upload.json().catch(() => ({}));
              toast.error(err.error ?? "Receipt upload failed");
            }
          }
        }

        toast.success(submit ? "Expense submitted for approval" : "Expense saved");
        if (warn.length) {
          toast.message("Review warnings", { description: warn[0] });
        }
        router.push(id ? `/finance/expenses/${id}` : "/finance/expenses");
        router.refresh();
      } catch {
        toast.error("Something went wrong");
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="merchant">Merchant</Label>
              <Input
                id="merchant"
                list="merchant-suggestions"
                autoComplete="off"
                {...form.register("merchant")}
                className="mt-1.5 h-11 rounded-xl"
                placeholder="Start typing a vendor…"
              />
              <datalist id="merchant-suggestions">
                {merchantSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                className="mt-1.5 h-11 rounded-xl"
                {...form.register("amount", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label htmlFor="tax">Tax</Label>
              <Input
                id="tax"
                type="number"
                step="0.01"
                className="mt-1.5 h-11 rounded-xl"
                {...form.register("tax", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label htmlFor="tip">Tip</Label>
              <Input
                id="tip"
                type="number"
                step="0.01"
                className="mt-1.5 h-11 rounded-xl"
                {...form.register("tip", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label>Total</Label>
              <div className="mt-1.5 flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-lg font-semibold text-slate-900">
                ${total.toFixed(2)}
              </div>
            </div>
            <div>
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input
                id="purchaseDate"
                type="date"
                className="mt-1.5 h-11 rounded-xl"
                {...form.register("purchaseDate")}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={form.watch("categoryId") ?? undefined}
                onValueChange={(v) => form.setValue("categoryId", v)}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company card</Label>
              <Select
                value={form.watch("companyCardId") ?? undefined}
                onValueChange={(v) => form.setValue("companyCardId", v)}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder="Select card" />
                </SelectTrigger>
                <SelectContent>
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.lastFour ? `••${c.lastFour}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canAssignEmployee ? (
              <div>
                <Label>Employee</Label>
                <Select
                  value={form.watch("employeeId") ?? defaultEmployeeId}
                  onValueChange={(v) => form.setValue("employeeId", v)}
                >
                  <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                    <SelectValue placeholder="Employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label>Location</Label>
              <Select
                value={form.watch("locationId") ?? undefined}
                onValueChange={(v) => form.setValue("locationId", v)}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                className="mt-1.5 h-11 rounded-xl"
                list="department-suggestions"
                {...form.register("department")}
              />
              <datalist id="department-suggestions">
                {[...new Set(employees.map((e) => e.department).filter(Boolean))].map((d) => (
                  <option key={String(d)} value={String(d)} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="project">Project</Label>
              <Input id="project" className="mt-1.5 h-11 rounded-xl" {...form.register("project")} />
            </div>
            <div>
              <Label htmlFor="jobNumber">Job number</Label>
              <Input id="jobNumber" className="mt-1.5 h-11 rounded-xl" {...form.register("jobNumber")} />
            </div>
            <div>
              <Label>Payment method</Label>
              <Select
                value={form.watch("paymentMethod") ?? "COMPANY_CARD"}
                onValueChange={(v) =>
                  form.setValue("paymentMethod", v as FormValues["paymentMethod"])
                }
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY_CARD">Company card</SelectItem>
                  <SelectItem value="PERSONAL_CARD">Personal card</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mileageMiles">Mileage (optional)</Label>
              <Input
                id="mileageMiles"
                type="number"
                step="0.1"
                className="mt-1.5 h-11 rounded-xl"
                {...form.register("mileageMiles", { valueAsNumber: true })}
              />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" className="mt-1.5 h-11 rounded-xl" {...form.register("currency")} />
            </div>
            <div>
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                className="mt-1.5 h-11 rounded-xl"
                placeholder="client, travel, urgent"
                onChange={(e) =>
                  form.setValue(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" className="mt-1.5 rounded-xl" rows={3} {...form.register("notes")} />
            </div>
          </div>

          {warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Warnings (not blocked)
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl"
              disabled={pending}
              onClick={() => void save(false)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save draft
            </Button>
            <Button
              type="button"
              className="min-h-11 rounded-xl"
              disabled={pending}
              onClick={() => void save(true)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit for approval
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle>Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptCapture onCaptured={onReceipt} onOcrText={(text) => void runOcr(text)} />
          {receipts.length > 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              {receipts.length} receipt page{receipts.length === 1 ? "" : "s"} ready to attach
            </p>
          ) : (
            <p className="mt-3 text-sm text-amber-700">
              No receipt yet — this expense will be marked Missing Receipt.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
