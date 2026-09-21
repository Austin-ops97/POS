"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeductionConfigView, TaxConfigView } from "@/lib/workforce/pay-stub-service";

type PayrollTaxFormProps = {
  canManage: boolean;
  taxes: TaxConfigView[];
  deductions: DeductionConfigView[];
};

const emptyTax = {
  side: "EMPLOYEE",
  code: "",
  name: "",
  basis: "PERCENT_OF_TAXABLE",
  rate: "",
  wageBase: "",
  effectiveFrom: "",
  effectiveTo: "",
};

const emptyDeduction = {
  code: "",
  name: "",
  timing: "PRE_TAX",
  basis: "PERCENT_OF_GROSS",
  rate: "",
  effectiveFrom: "",
  effectiveTo: "",
};

export function PayrollTaxForm({ canManage, taxes, deductions }: PayrollTaxFormProps) {
  const router = useRouter();
  const [taxForm, setTaxForm] = useState(emptyTax);
  const [deductionForm, setDeductionForm] = useState(emptyDeduction);
  const [savingTax, setSavingTax] = useState(false);
  const [savingDeduction, setSavingDeduction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTax() {
    setSavingTax(true);
    setError(null);
    const res = await fetch("/api/workforce/payroll/tax-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        side: taxForm.side,
        code: taxForm.code,
        name: taxForm.name,
        basis: taxForm.basis,
        rate: Number(taxForm.rate),
        wageBase: taxForm.wageBase === "" ? null : Number(taxForm.wageBase),
        effectiveFrom: taxForm.effectiveFrom,
        effectiveTo: taxForm.effectiveTo || null,
      }),
    });
    setSavingTax(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = body?.error ?? "Could not save tax rule";
      setError(message);
      toast.error(message);
      return;
    }
    toast.success("Tax rule saved");
    setTaxForm(emptyTax);
    router.refresh();
  }

  async function saveDeduction() {
    setSavingDeduction(true);
    setError(null);
    const res = await fetch("/api/workforce/payroll/deduction-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: deductionForm.code,
        name: deductionForm.name,
        timing: deductionForm.timing,
        basis: deductionForm.basis,
        rate: Number(deductionForm.rate),
        effectiveFrom: deductionForm.effectiveFrom,
        effectiveTo: deductionForm.effectiveTo || null,
      }),
    });
    setSavingDeduction(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = body?.error ?? "Could not save deduction";
      setError(message);
      toast.error(message);
      return;
    }
    toast.success("Deduction saved");
    setDeductionForm(emptyDeduction);
    router.refresh();
  }

  async function endRule(kind: "tax" | "deduction", id: string) {
    const effectiveTo = window.prompt("End this rule on (YYYY-MM-DD)");
    if (!effectiveTo) return;
    const path = kind === "tax" ? "tax-configs" : "deduction-configs";
    const res = await fetch(`/api/workforce/payroll/${path}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effectiveTo }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Could not end this rule");
      return;
    }
    toast.success("Rule ended");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tax and deduction rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            No tax rates are built in. Add the employee withholding and employer payroll taxes that apply to this business. A new row with the same code becomes the version used on pay dates it covers. Processed stubs keep the amounts from the day they were run.
          </p>
          <p>Percent rates are decimals: 0.062 is 6.2%. Flat amounts are dollars.</p>
          {!taxes.length && !deductions.length ? (
            <p className="rounded-lg bg-slate-50 p-3 text-slate-700">No payroll tax or deduction rules yet. Pay stubs will show $0 withholding until you add rules.</p>
          ) : null}
        </CardContent>
      </Card>

      <ConfigTable
        title="Employee and employer taxes"
        empty="No tax rules."
        rows={taxes.map((rule) => ({
          id: rule.id,
          cells: [
            rule.side === "EMPLOYER" ? "Employer" : "Employee",
            rule.code,
            rule.name,
            rule.basis === "FLAT" ? `$${rule.rate.toFixed(2)}` : `${(rule.rate * 100).toFixed(2)}%`,
            rule.wageBase != null ? `$${rule.wageBase.toFixed(2)}` : "—",
            `${rule.effectiveFrom}${rule.effectiveTo ? ` – ${rule.effectiveTo}` : " – open"}`,
          ],
          open: rule.effectiveTo == null,
        }))}
        canManage={canManage}
        onEnd={(id) => endRule("tax", id)}
      />

      <ConfigTable
        title="Deductions"
        empty="No deduction rules."
        rows={deductions.map((rule) => ({
          id: rule.id,
          cells: [
            rule.timing === "PRE_TAX" ? "Pre-tax" : "Post-tax",
            rule.code,
            rule.name,
            rule.basis === "FLAT" ? `$${rule.rate.toFixed(2)}` : `${(rule.rate * 100).toFixed(2)}%`,
            "—",
            `${rule.effectiveFrom}${rule.effectiveTo ? ` – ${rule.effectiveTo}` : " – open"}`,
          ],
          open: rule.effectiveTo == null,
        }))}
        canManage={canManage}
        onEnd={(id) => endRule("deduction", id)}
      />

      {canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Add tax rule</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Side">
                <Select value={taxForm.side} onValueChange={(value) => setTaxForm((form) => ({ ...form, side: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Employee withholding</SelectItem>
                    <SelectItem value="EMPLOYER">Employer tax</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Code">
                <Input value={taxForm.code} onChange={(event) => setTaxForm((form) => ({ ...form, code: event.target.value }))} placeholder="SOCIAL_SECURITY" />
              </Field>
              <Field label="Name">
                <Input value={taxForm.name} onChange={(event) => setTaxForm((form) => ({ ...form, name: event.target.value }))} placeholder="Social Security" />
              </Field>
              <Field label="Basis">
                <Select value={taxForm.basis} onValueChange={(value) => setTaxForm((form) => ({ ...form, basis: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT_OF_TAXABLE">Percent of taxable wages</SelectItem>
                    <SelectItem value="PERCENT_OF_GROSS">Percent of gross</SelectItem>
                    <SelectItem value="FLAT">Flat amount</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Rate">
                <Input type="number" min="0" step="0.0001" value={taxForm.rate} onChange={(event) => setTaxForm((form) => ({ ...form, rate: event.target.value }))} />
              </Field>
              <Field label="Annual wage base (optional)">
                <Input type="number" min="0" step="0.01" value={taxForm.wageBase} onChange={(event) => setTaxForm((form) => ({ ...form, wageBase: event.target.value }))} />
              </Field>
              <Field label="Effective from">
                <Input type="date" value={taxForm.effectiveFrom} onChange={(event) => setTaxForm((form) => ({ ...form, effectiveFrom: event.target.value }))} />
              </Field>
              <Field label="Effective to (optional)">
                <Input type="date" value={taxForm.effectiveTo} onChange={(event) => setTaxForm((form) => ({ ...form, effectiveTo: event.target.value }))} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="button" disabled={savingTax || !taxForm.code || !taxForm.name || !taxForm.rate || !taxForm.effectiveFrom} onClick={saveTax}>
                  {savingTax ? "Saving..." : "Save tax rule"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add deduction</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Timing">
                <Select value={deductionForm.timing} onValueChange={(value) => setDeductionForm((form) => ({ ...form, timing: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRE_TAX">Pre-tax</SelectItem>
                    <SelectItem value="POST_TAX">Post-tax</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Code">
                <Input value={deductionForm.code} onChange={(event) => setDeductionForm((form) => ({ ...form, code: event.target.value }))} placeholder="RETIREMENT" />
              </Field>
              <Field label="Name">
                <Input value={deductionForm.name} onChange={(event) => setDeductionForm((form) => ({ ...form, name: event.target.value }))} placeholder="Retirement" />
              </Field>
              <Field label="Basis">
                <Select value={deductionForm.basis} onValueChange={(value) => setDeductionForm((form) => ({ ...form, basis: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT_OF_GROSS">Percent of gross</SelectItem>
                    <SelectItem value="PERCENT_OF_TAXABLE">Percent of taxable wages</SelectItem>
                    <SelectItem value="FLAT">Flat amount</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Rate">
                <Input type="number" min="0" step="0.0001" value={deductionForm.rate} onChange={(event) => setDeductionForm((form) => ({ ...form, rate: event.target.value }))} />
              </Field>
              <Field label="Effective from">
                <Input type="date" value={deductionForm.effectiveFrom} onChange={(event) => setDeductionForm((form) => ({ ...form, effectiveFrom: event.target.value }))} />
              </Field>
              <Field label="Effective to (optional)">
                <Input type="date" value={deductionForm.effectiveTo} onChange={(event) => setDeductionForm((form) => ({ ...form, effectiveTo: event.target.value }))} />
              </Field>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  disabled={savingDeduction || !deductionForm.code || !deductionForm.name || !deductionForm.rate || !deductionForm.effectiveFrom}
                  onClick={saveDeduction}
                >
                  {savingDeduction ? "Saving..." : "Save deduction"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ConfigTable({
  title,
  empty,
  rows,
  canManage,
  onEnd,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; cells: string[]; open: boolean }>;
  canManage: boolean;
  onEnd: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Rate</th>
                  <th className="px-4 py-3 font-medium">Wage base</th>
                  <th className="px-4 py-3 font-medium">Effective</th>
                  {canManage ? <th className="px-4 py-3 font-medium"></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    {row.cells.map((cell, index) => (
                      <td key={`${row.id}-${index}`} className="px-4 py-3">{cell}</td>
                    ))}
                    {canManage ? (
                      <td className="px-4 py-3">
                        {row.open ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => onEnd(row.id)}>
                            End
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
