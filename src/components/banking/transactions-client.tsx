"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

type Option = { id: string; name: string };
type Split = { categoryId: string | null; projectId: string | null; vendorId: string | null; amount: string; notes: string };
type Transaction = {
  id: string;
  postedOn: string;
  rawDescription: string;
  rawMerchant: string | null;
  amount: number;
  type: string;
  accountName: string;
  accountMask: string | null;
  source: string;
  categoryId: string | null;
  categoryName: string | null;
  suggestionReason: string | null;
  projectId: string | null;
  vendorId: string | null;
  customerId: string | null;
  matchedExpenseId: string | null;
  notes: string | null;
  personal: boolean;
  reconciliation: string;
  splits: { id: string; categoryId: string | null; categoryName: string | null; amount: number; notes: string | null }[];
  associations: { id: string; receiptId: string | null }[];
};

export type BankCenterData = {
  transactions: Transaction[];
  accounts: Option[];
  categories: Option[];
  vendors: Option[];
  projects: { id: string; title: string }[];
  customers: Option[];
  employees: Option[];
  receipts: { id: string; fileName: string; merchant: string }[];
  expenses: Option[];
};

export function TransactionsClient({
  data,
  canEdit,
  previousHref,
  nextHref,
}: {
  data: BankCenterData;
  canEdit: boolean;
  previousHref?: string | null;
  nextHref?: string | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("Imported statement");
  const [file, setFile] = useState<File | null>(null);

  async function save(id: string, form: FormData) {
    setBusy(id);
    setError(null);
    const response = await fetch(`/api/banking/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: String(form.get("categoryId") || "") || null,
        projectId: String(form.get("projectId") || "") || null,
        vendorId: String(form.get("vendorId") || "") || null,
        customerId: String(form.get("customerId") || "") || null,
        notes: String(form.get("notes") || ""),
        personal: form.get("personal") === "on",
        remember: form.get("remember") === "on",
        matchedExpenseId: String(form.get("matchedExpenseId") || "") || null,
      }),
    });
    const body = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(body?.error ?? "Could not save the transaction");
      toast.error(body?.error ?? "Could not save the transaction");
      return;
    }
    toast.success("Transaction updated");
    router.refresh();
  }

  async function saveSplits(id: string, splits: Split[]) {
    setBusy(`${id}-split`);
    setError(null);
    const response = await fetch(`/api/banking/transactions/${id}/splits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        splits: splits
          .filter((split) => split.amount.trim())
          .map((split) => ({
            categoryId: split.categoryId || null,
            projectId: split.projectId || null,
            vendorId: split.vendorId || null,
            amount: Number(split.amount),
            notes: split.notes || null,
          })),
      }),
    });
    const body = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(body?.error ?? "Could not save the split");
      toast.error(body?.error ?? "Could not save the split");
      return;
    }
    toast.success("Split saved");
    router.refresh();
  }

  async function attach(id: string, receiptId: string, employeeId: string) {
    if (!receiptId) return;
    setBusy(`${id}-receipt`);
    const response = await fetch("/api/banking/associations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiptId,
        bankTransactionId: id,
        employeeId: employeeId || null,
      }),
    });
    const body = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(body?.error ?? "Could not link the receipt");
      toast.error(body?.error ?? "Could not link the receipt");
      return;
    }
    toast.success(body.created ? "Receipt linked" : "That receipt is already linked");
    router.refresh();
  }

  async function importStatement() {
    if (!file) {
      setError("Choose a CSV or Excel statement");
      return;
    }
    setBusy("import");
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("accountName", accountName);
    const response = await fetch("/api/banking/statements", { method: "POST", body: form });
    const body = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(body?.error ?? "Import failed");
      toast.error(body?.error ?? "Import failed");
      return;
    }
    toast.success(`Imported ${body.imported}. Skipped ${body.skipped}. Unreadable ${body.invalid}.`);
    setFile(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Bank transactions</h1>
        <p className="mt-1 text-sm text-slate-500">Imported bank rows stay as posted. Category, project, vendor, notes, and splits are stored beside them.</p>
      </div>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      {canEdit ? (
        <form
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void importStatement();
          }}
        >
          <div>
            <Label htmlFor="statement-file">Import bank statement</Label>
            <Input id="statement-file" className="mt-1.5" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label htmlFor="account-name">Account name</Label>
            <Input id="account-name" className="mt-1.5" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
          </div>
          <Button type="submit" disabled={busy !== null}>{busy === "import" ? "Importing…" : "Import CSV or Excel"}</Button>
          <p className="text-xs text-slate-500 sm:col-span-3">PDF statements stay in Bank statements and are not parsed. Duplicate rows in the same account are skipped.</p>
        </form>
      ) : null}

      {data.transactions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">No bank transactions yet. Connect a bank in Settings → Integrations → Banking, or import a statement.</p>
      ) : (
        <ul className="space-y-3">
          {data.transactions.map((txn) => (
            <li key={txn.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <button type="button" className="grid w-full gap-2 text-left sm:grid-cols-6 sm:items-center" onClick={() => setOpenId(openId === txn.id ? null : txn.id)}>
                <span className="text-sm text-slate-500">{txn.postedOn}</span>
                <span className="sm:col-span-2">
                  <span className="block font-medium text-slate-900">{txn.rawMerchant || txn.rawDescription}</span>
                  <span className="block text-xs text-slate-500">{txn.rawDescription}</span>
                </span>
                <span className="text-sm text-slate-600">{txn.accountName}{txn.accountMask ? ` ${txn.accountMask}` : ""} · {txn.type}</span>
                <span className={`text-sm font-semibold ${txn.amount < 0 ? "text-slate-900" : "text-emerald-700"}`}>{formatCurrency(txn.amount)}</span>
                <span className="text-sm text-slate-600">{txn.personal ? "Personal" : txn.categoryName || "Uncategorized"} · {txn.reconciliation}</span>
              </button>
              {txn.suggestionReason && !txn.categoryId ? <p className="mt-2 text-xs text-slate-500">{txn.suggestionReason}. This is a suggestion until you save a category.</p> : null}
              {openId === txn.id ? (
                <TransactionEditor txn={txn} data={data} canEdit={canEdit} busy={busy} onSave={save} onSplit={saveSplits} onAttach={attach} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        {previousHref ? <Link className="text-sm text-emerald-700 underline" href={previousHref}>Previous page</Link> : null}
        {nextHref ? <Link className="text-sm text-emerald-700 underline" href={nextHref}>Next page</Link> : null}
      </div>
      <p className="text-sm text-slate-500">
        Need a new receipt file? <Link className="text-emerald-700 underline" href="/finance/expenses/new">Create an expense</Link> and it can be linked here without uploading it twice.
      </p>
    </div>
  );
}

function TransactionEditor({
  txn,
  data,
  canEdit,
  busy,
  onSave,
  onSplit,
  onAttach,
}: {
  txn: Transaction;
  data: BankCenterData;
  canEdit: boolean;
  busy: string | null;
  onSave: (id: string, form: FormData) => Promise<void>;
  onSplit: (id: string, splits: Split[]) => Promise<void>;
  onAttach: (id: string, receiptId: string, employeeId: string) => Promise<void>;
}) {
  const [splits, setSplits] = useState<Split[]>(
    txn.splits.length
      ? txn.splits.map((split) => ({ categoryId: split.categoryId, projectId: null, vendorId: null, amount: String(split.amount), notes: split.notes ?? "" }))
      : [{ categoryId: "", projectId: "", vendorId: "", amount: "", notes: "" }],
  );
  const [receiptId, setReceiptId] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(txn.id, new FormData(event.currentTarget));
        }}
      >
        <Field label="Category" name="categoryId" defaultValue={txn.categoryId ?? ""} options={data.categories} disabled={!canEdit} />
        <Field label="Project" name="projectId" defaultValue={txn.projectId ?? ""} options={data.projects.map((project) => ({ id: project.id, name: project.title }))} disabled={!canEdit} />
        <Field label="Vendor" name="vendorId" defaultValue={txn.vendorId ?? ""} options={data.vendors} disabled={!canEdit} />
        <Field label="Customer" name="customerId" defaultValue={txn.customerId ?? ""} options={data.customers} disabled={!canEdit} />
        <Field label="Matched expense" name="matchedExpenseId" defaultValue={txn.matchedExpenseId ?? ""} options={data.expenses} disabled={!canEdit} />
        <div className="sm:col-span-2">
          <Label htmlFor={`${txn.id}-notes`}>Notes</Label>
          <Input id={`${txn.id}-notes`} name="notes" className="mt-1.5" defaultValue={txn.notes ?? ""} disabled={!canEdit} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="personal" defaultChecked={txn.personal} disabled={!canEdit} />
          Personal / non-business
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="remember" disabled={!canEdit} />
          Remember this category for future transactions
        </label>
        {canEdit ? <Button type="submit" disabled={busy !== null}>{busy === txn.id ? "Saving…" : "Save category"}</Button> : null}
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Split</p>
        {splits.map((split, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-4">
            <select className="h-11 rounded-xl border border-slate-200 px-3 text-sm" value={split.categoryId ?? ""} disabled={!canEdit} onChange={(event) => updateSplit(setSplits, index, { categoryId: event.target.value })}>
              <option value="">Category</option>
              {data.categories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <select className="h-11 rounded-xl border border-slate-200 px-3 text-sm" value={split.projectId ?? ""} disabled={!canEdit} onChange={(event) => updateSplit(setSplits, index, { projectId: event.target.value })}>
              <option value="">Project</option>
              {data.projects.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
            </select>
            <select className="h-11 rounded-xl border border-slate-200 px-3 text-sm" value={split.vendorId ?? ""} disabled={!canEdit} onChange={(event) => updateSplit(setSplits, index, { vendorId: event.target.value })}>
              <option value="">Vendor</option>
              {data.vendors.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <Input inputMode="decimal" placeholder="Amount" value={split.amount} disabled={!canEdit} onChange={(event) => updateSplit(setSplits, index, { amount: event.target.value })} />
          </div>
        ))}
        {canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setSplits([...splits, { categoryId: "", projectId: "", vendorId: "", amount: "", notes: "" }])}>Add part</Button>
            <Button type="button" disabled={busy !== null} onClick={() => void onSplit(txn.id, splits)}>{busy === `${txn.id}-split` ? "Saving split…" : "Save split"}</Button>
          </div>
        ) : null}
        <p className="text-xs text-slate-500">Split amounts use the absolute value of the bank amount. The original row is not rewritten.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label>Existing receipt</Label>
          <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" value={receiptId} disabled={!canEdit} onChange={(event) => setReceiptId(event.target.value)}>
            <option value="">Choose a receipt</option>
            {data.receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.merchant} · {receipt.fileName}</option>)}
          </select>
        </div>
        <div>
          <Label>Employee</Label>
          <select className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" value={employeeId} disabled={!canEdit} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">Optional</option>
            {data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </div>
        {canEdit ? <Button type="button" variant="outline" disabled={busy !== null || !receiptId} onClick={() => void onAttach(txn.id, receiptId, employeeId)}>{busy === `${txn.id}-receipt` ? "Linking…" : "Link receipt"}</Button> : null}
        {txn.associations.some((association) => association.receiptId) ? <p className="text-xs text-slate-500 sm:col-span-3">A receipt is already linked to this transaction.</p> : null}
      </div>
    </div>
  );
}

function updateSplit(setSplits: Dispatch<SetStateAction<Split[]>>, index: number, patch: Partial<Split>) {
  setSplits((current) => current.map((split, splitIndex) => (splitIndex === index ? { ...split, ...patch } : split)));
}

function Field({ label, name, defaultValue, options, disabled }: { label: string; name: string; defaultValue: string; options: Option[]; disabled: boolean }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} defaultValue={defaultValue} disabled={disabled} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">
        <option value="">None</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </div>
  );
}
