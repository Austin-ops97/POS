"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { expenseCreateSchema } from "@/lib/validations/expenses";
import { reconcileItemizedExpense, lineAmount } from "@/lib/expenses/reconciliation";
import type { OcrParseResult } from "@/lib/expenses/ocr";
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
  initialReceiptAction?: "scan" | "upload";
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
  initialReceiptAction,
  expenseId,
  initialValues,
}: ExpenseFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receipts, setReceipts] = useState<CapturedReceipt[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [merchantSuggestions, setMerchantSuggestions] = useState<string[]>([]);
  const [ocrDraft, setOcrDraft] = useState<OcrParseResult | null>(null);
  const [acknowledgeDiscrepancy, setAcknowledgeDiscrepancy] = useState(false);

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
      entryMode: "SIMPLE",
      lineItems: [],
      tags: [],
      ...initialValues,
    },
  });

  const amount = form.watch("amount") || 0;
  const tax = form.watch("tax") || 0;
  const tip = form.watch("tip") || 0;
  const entryMode = form.watch("entryMode") ?? "SIMPLE";
  const watchedLines = form.watch("lineItems");
  const lineItems = useMemo(() => watchedLines ?? [], [watchedLines]);
  const receiptTotalInput = form.watch("total");
  const simpleTotal = useMemo(
    () => Number((Number(amount) + Number(tax) + Number(tip)).toFixed(2)),
    [amount, tax, tip]
  );
  const itemized = useMemo(() => {
    const lines = lineItems.map((line) => ({ amount: Number(line.amount) || 0 }));
    const receiptTotal = Number(receiptTotalInput ?? 0);
    return reconcileItemizedExpense({
      lines,
      tax: Number(tax) || 0,
      tip: Number(tip) || 0,
      receiptTotal: Number.isFinite(receiptTotal) ? receiptTotal : 0,
    });
  }, [lineItems, tax, tip, receiptTotalInput]);
  const discrepancy = entryMode === "ITEMIZED" && lineItems.length > 0 && !itemized.matches;

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
      setOcrDraft(data as OcrParseResult);
      toast.message("Review the extracted receipt before applying it");
    } catch {
      toast.error("Unable to parse receipt text");
    }
  }

  function applyOcr() {
    if (!ocrDraft) return;
    if (ocrDraft.merchant) form.setValue("merchant", ocrDraft.merchant, { shouldDirty: true });
    if (ocrDraft.address) form.setValue("merchantAddress", ocrDraft.address, { shouldDirty: true });
    if (ocrDraft.date) form.setValue("purchaseDate", ocrDraft.date, { shouldDirty: true });
    if (ocrDraft.time) form.setValue("purchaseTime", ocrDraft.time, { shouldDirty: true });
    if (ocrDraft.receiptNumber) form.setValue("receiptNumber", ocrDraft.receiptNumber, { shouldDirty: true });
    if (ocrDraft.tax != null) form.setValue("tax", ocrDraft.tax, { shouldDirty: true });
    if (ocrDraft.tip != null) form.setValue("tip", ocrDraft.tip, { shouldDirty: true });
    if (ocrDraft.cardLast4) form.setValue("paymentLast4", ocrDraft.cardLast4, { shouldDirty: true });
    if (ocrDraft.categorySuggestion) {
      const match = categories.find((category) => category.name.toLowerCase() === ocrDraft.categorySuggestion?.toLowerCase());
      if (match) form.setValue("categoryId", match.id, { shouldDirty: true });
    }
    if (ocrDraft.items.length) {
      form.setValue("entryMode", "ITEMIZED", { shouldDirty: true });
      form.setValue(
        "lineItems",
        ocrDraft.items.map((item) => ({
          description: item.description,
          quantity: item.quantity ?? 1,
          unitPrice: item.unitPrice ?? null,
          amount: item.amount,
        })),
        { shouldDirty: true }
      );
      if (ocrDraft.total != null) form.setValue("total", ocrDraft.total, { shouldDirty: true });
      else if (ocrDraft.amount != null) form.setValue("amount", ocrDraft.amount, { shouldDirty: true });
    } else {
      if (ocrDraft.amount != null) form.setValue("amount", ocrDraft.amount, { shouldDirty: true });
      if (ocrDraft.total != null) form.setValue("total", ocrDraft.total, { shouldDirty: true });
    }
    setOcrDraft(null);
    setAcknowledgeDiscrepancy(false);
    toast.success("Extracted fields applied. Check them before you save.");
  }

  function onReceipt(receipt: CapturedReceipt) {
    setReceipts((prev) => [...prev, receipt]);
    form.setValue("missingReceipt", false, { shouldDirty: true });
  }

  async function save(submit: boolean) {
    const values = form.getValues();
    startTransition(async () => {
      try {
        if (entryMode === "ITEMIZED" && discrepancy && !acknowledgeDiscrepancy) {
          toast.error("Line totals do not match the receipt total. Fix them or confirm the discrepancy.");
          return;
        }
        const itemizedLines = (values.lineItems ?? []).filter((line) => line.description.trim());
        if (entryMode === "ITEMIZED" && itemizedLines.length === 0) {
          toast.error("Add at least one line with a description.");
          return;
        }
        const receiptTotal = Number(values.total);
        const payload = {
          ...values,
          entryMode,
          amount: entryMode === "ITEMIZED" ? itemized.lineSum : values.amount,
          total: entryMode === "ITEMIZED" ? (Number.isFinite(receiptTotal) ? receiptTotal : itemized.expectedTotal) : simpleTotal,
          lineItems: entryMode === "ITEMIZED" ? itemizedLines : [],
          acknowledgeDiscrepancy,
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
              body: JSON.stringify({ ...receipt, role: receipt.role ?? (receipt.enhanced ? "PROCESSED" : "ORIGINAL") }),
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

  function setMode(mode: "SIMPLE" | "ITEMIZED") {
    form.setValue("entryMode", mode, { shouldDirty: true });
    setAcknowledgeDiscrepancy(false);
    if (mode === "ITEMIZED" && lineItems.length === 0) {
      form.setValue("lineItems", [{ description: "", quantity: 1, unitPrice: null, amount: 0 }], { shouldDirty: true });
    }
  }

  function updateLine(index: number, patch: Partial<(typeof lineItems)[number]>) {
    const next = lineItems.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const merged = { ...line, ...patch };
      if ("quantity" in patch || "unitPrice" in patch) {
        const price = Number(merged.unitPrice ?? 0);
        if (price > 0) merged.amount = lineAmount(Number(merged.quantity ?? 1), price);
      }
      return merged;
    });
    form.setValue("lineItems", next, { shouldDirty: true });
    setAcknowledgeDiscrepancy(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {(["SIMPLE", "ITEMIZED"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`min-h-11 rounded-lg text-sm font-medium ${entryMode === mode ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                onClick={() => setMode(mode)}
              >
                {mode === "SIMPLE" ? "Simple expense" : "Itemized expense"}
              </button>
            ))}
          </div>
          {ocrDraft ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="font-medium text-emerald-950">Confirm extracted receipt fields before they are used.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input value={ocrDraft.merchant ?? ""} onChange={(event) => setOcrDraft({ ...ocrDraft, merchant: event.target.value })} placeholder="Merchant" />
                <Input value={ocrDraft.date ?? ""} onChange={(event) => setOcrDraft({ ...ocrDraft, date: event.target.value })} placeholder="Date" />
                <Input value={ocrDraft.total?.toString() ?? ""} onChange={(event) => setOcrDraft({ ...ocrDraft, total: Number(event.target.value) })} placeholder="Total" />
                <Input value={ocrDraft.receiptNumber ?? ""} onChange={(event) => setOcrDraft({ ...ocrDraft, receiptNumber: event.target.value })} placeholder="Receipt number" />
              </div>
              <p className="text-xs text-emerald-900">
                {[ocrDraft.address, ocrDraft.time, ocrDraft.cardLast4 ? `Card ••${ocrDraft.cardLast4}` : null, ocrDraft.items.length ? `${ocrDraft.items.length} line items` : null]
                  .filter(Boolean)
                  .join(" · ") || "No extra fields detected."}
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={applyOcr}>Apply to expense</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOcrDraft(null)}>Discard</Button>
              </div>
            </div>
          ) : null}
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
            {entryMode === "SIMPLE" ? (
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
            ) : (
            <div>
              <Label>Line subtotal</Label>
              <div className="mt-1.5 flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 font-semibold text-slate-900">
                ${itemized.lineSum.toFixed(2)}
              </div>
            </div>
            )}
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
              <Label htmlFor="receiptTotal">{entryMode === "ITEMIZED" ? "Receipt total" : "Total"}</Label>
              {entryMode === "ITEMIZED" ? (
                <Input
                  id="receiptTotal"
                  type="number"
                  step="0.01"
                  className="mt-1.5 h-11 rounded-xl"
                  {...form.register("total", { valueAsNumber: true })}
                />
              ) : (
                <div className="mt-1.5 flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-lg font-semibold text-slate-900">
                  ${simpleTotal.toFixed(2)}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="purchaseTime">Time</Label>
              <Input id="purchaseTime" type="time" className="mt-1.5 h-11 rounded-xl" {...form.register("purchaseTime")} />
            </div>
            <div>
              <Label htmlFor="receiptNumber">Receipt number</Label>
              <Input id="receiptNumber" className="mt-1.5 h-11 rounded-xl" {...form.register("receiptNumber")} />
            </div>
            <div>
              <Label htmlFor="paymentLast4">Card last 4</Label>
              <Input id="paymentLast4" inputMode="numeric" maxLength={4} className="mt-1.5 h-11 rounded-xl" {...form.register("paymentLast4")} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="merchantAddress">Merchant address</Label>
              <Input id="merchantAddress" className="mt-1.5 h-11 rounded-xl" {...form.register("merchantAddress")} />
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
            {entryMode === "ITEMIZED" ? (
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Line items</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      form.setValue("lineItems", [...lineItems, { description: "", quantity: 1, unitPrice: null, amount: 0 }], { shouldDirty: true })
                    }
                  >
                    Add line
                  </Button>
                </div>
                {lineItems.map((line, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-6">
                    <Input className="sm:col-span-2" placeholder="Description" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
                    <Input type="number" step="1" min="0" placeholder="Qty" value={line.quantity ?? 1} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} />
                    <Input type="number" step="0.01" min="0" placeholder="Unit price" value={line.unitPrice ?? ""} onChange={(event) => updateLine(index, { unitPrice: event.target.value === "" ? null : Number(event.target.value) })} />
                    <Input type="number" step="0.01" min="0" placeholder="Line total" value={line.amount} onChange={(event) => updateLine(index, { amount: Number(event.target.value) })} />
                    <select
                      className="h-10 rounded-md border border-slate-200 px-2 text-sm"
                      value={line.categoryId ?? ""}
                      onChange={(event) => updateLine(index, { categoryId: event.target.value || null })}
                    >
                      <option value="">Category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                    <Button type="button" variant="ghost" className="sm:col-span-6 justify-start text-red-600" onClick={() => form.setValue("lineItems", lineItems.filter((_, lineIndex) => lineIndex !== index), { shouldDirty: true })}>
                      Remove line
                    </Button>
                  </div>
                ))}
                <div>
                  <Label htmlFor="businessPurpose">Business purpose</Label>
                  <Input id="businessPurpose" className="mt-1.5 h-11 rounded-xl" {...form.register("businessPurpose")} />
                </div>
                {discrepancy ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-medium">
                      Receipt total ${itemized.receiptTotal.toFixed(2)} does not match lines + tax + tip (${itemized.expectedTotal.toFixed(2)}).
                      Difference ${itemized.difference.toFixed(2)}.
                    </p>
                    <label className="mt-2 flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={acknowledgeDiscrepancy} onChange={(event) => setAcknowledgeDiscrepancy(event.target.checked)} />
                      <span>I reviewed this discrepancy and still want to save. It will be flagged for approval.</span>
                    </label>
                  </div>
                ) : lineItems.length > 0 ? (
                  <p className="text-sm text-emerald-800">Line totals match the receipt total.</p>
                ) : null}
              </div>
            ) : null}
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
          <ReceiptCapture
            initialAction={initialReceiptAction}
            onCaptured={onReceipt}
            onOcrText={(text) => void runOcr(text)}
          />
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
