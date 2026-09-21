"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  DETECTED_ENTITIES,
  fieldsFor,
  isCommitEntity,
  suggestMapping,
  type CommitEntity,
  type FieldMapping,
} from "@/lib/import/import-plan";

type PreviewRow = {
  rowNumber: number;
  action: string;
  errors: string[];
  warnings: string[];
  matchReason: string | null;
};

type Preview = {
  entityType: string;
  committable: boolean;
  message: string | null;
  counts: { valid: number; invalid: number; duplicate: number; skipped: number };
  rows: PreviewRow[];
};

const LABELS: Record<string, string> = {
  CUSTOMER: "Customers",
  VENDOR: "Vendors",
  PRODUCT: "Products",
  EXPENSE: "Expenses",
  INVOICE: "Invoices",
  PAYMENT: "Payments",
  ACCOUNT: "Accounts",
  EMPLOYEE: "Employees",
  INVENTORY: "Inventory",
  TRANSACTION: "Transactions",
  PROJECT: "Projects",
};

export function ImportWizard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [entityType, setEntityType] = useState<string>("CUSTOMER");
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number; failed: number } | null>(null);
  const [busy, setBusy] = useState<"upload" | "preview" | "import" | "rollback" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => (isCommitEntity(entityType) ? fieldsFor(entityType) : []), [entityType]);

  async function upload(file: File) {
    setBusy("upload");
    setError(null);
    setPreview(null);
    setResult(null);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/import/batches", { method: "POST", body });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Could not read that file");
      return;
    }
    setFileName(file.name);
    setBatchId(data.id);
    setHeaders(data.headers);
    setEntityType(data.entityType);
    setMapping(data.mapping ?? {});
  }

  function changeEntity(next: string) {
    setEntityType(next);
    setPreview(null);
    setResult(null);
    setMapping(isCommitEntity(next) ? suggestMapping(next as CommitEntity, headers) : {});
  }

  async function runPreview() {
    if (!batchId) return;
    setBusy("preview");
    setError(null);
    const response = await fetch(`/api/import/batches/${batchId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, mapping }),
    });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Preview failed");
      return;
    }
    setPreview(data);
  }

  async function runImport() {
    if (!batchId) return;
    setBusy("import");
    setError(null);
    const response = await fetch(`/api/import/batches/${batchId}/commit`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Import failed");
      toast.error(data?.error ?? "Import failed");
      return;
    }
    setResult(data);
    toast.success("Import finished");
  }

  async function runRollback() {
    if (!batchId) return;
    if (!window.confirm("Roll back this batch? Created records are removed and updated records return to their previous values.")) return;
    setBusy("rollback");
    setError(null);
    const response = await fetch(`/api/import/batches/${batchId}/rollback`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setError(data?.error ?? "Rollback failed");
      return;
    }
    toast.success("Import batch rolled back");
    setResult(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">CSV, Excel (.xlsx), text, or a QuickBooks IIF export. Up to 500 rows and 1.5 MB. Larger files should be split. Imports run in the request, not a background queue.</p>
          <Label htmlFor="import-file">File</Label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,.txt,.iif,text/csv,text/plain"
            className="block w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {busy === "upload" ? <p className="text-sm text-slate-500">Reading file…</p> : null}
          {fileName && batchId ? <p className="text-sm text-slate-700">{fileName} · {headers.length} columns</p> : null}
        </CardContent>
      </Card>

      {batchId ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Record type and field mapping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="entity-type">Record type</Label>
              <select id="entity-type" value={entityType} onChange={(event) => changeEntity(event.target.value)} className="h-10 w-full max-w-sm rounded-md border border-slate-200 bg-white px-3">
                {DETECTED_ENTITIES.map((entity) => (
                  <option key={entity} value={entity}>
                    {LABELS[entity]}{isCommitEntity(entity) ? "" : " (detect only)"}
                  </option>
                ))}
              </select>
            </div>
            {isCommitEntity(entityType) ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <label key={field} className="space-y-1 text-sm">
                    <span className="text-slate-600">{field}</span>
                    <select
                      value={mapping[field] ?? ""}
                      onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value || null }))}
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3"
                    >
                      <option value="">Not mapped</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                This file looks like {LABELS[entityType] ?? entityType}. EmeraldOne can import customers, vendors, products, and expenses. Choose one of those if that is the right record type.
              </p>
            )}
            <Button type="button" variant="outline" disabled={busy !== null || !isCommitEntity(entityType)} onClick={runPreview}>
              {busy === "preview" ? "Checking rows…" : "3. Preview rows"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>4. Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.message ? <p className="text-sm text-amber-800">{preview.message}</p> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <Count label="Ready to add" value={preview.counts.valid} />
              <Count label="Will update" value={preview.counts.duplicate} />
              <Count label="Invalid" value={preview.counts.invalid} />
              <Count label="Skipped" value={preview.counts.skipped} />
            </div>
            <p className="text-sm text-slate-600">Matched customers, vendors, and products are updated. Matched expenses are skipped so a second import does not create another copy. Rows that repeat an email, phone, SKU, barcode, vendor, receipt, or external id inside the file are skipped.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-3">Row</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 40).map((row) => (
                    <tr key={row.rowNumber} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{row.rowNumber}</td>
                      <td className="py-2 pr-3">{row.action}</td>
                      <td className="py-2">{[...row.errors, ...row.warnings].join("; ") || row.matchReason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              disabled={busy !== null || !preview.committable || preview.counts.valid + preview.counts.duplicate === 0}
              onClick={runImport}
            >
              {busy === "import" ? "Importing…" : "5. Import valid rows"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {result && batchId ? (
        <Card>
          <CardHeader>
            <CardTitle>6. Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.failed > 0 || result.skipped > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Import finished with a partial result. {result.imported} added, {result.updated} updated, {result.skipped} skipped as duplicates, and {result.failed} could not be saved. Download the error report for the rows that failed.
              </p>
            ) : (
              <p className="text-sm text-slate-600">Import finished. Every ready row was saved.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-4">
              <Count label="Imported" value={result.imported} />
              <Count label="Updated" value={result.updated} />
              <Count label="Skipped" value={result.skipped} />
              <Count label="Failed" value={result.failed} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" asChild>
                <a href={`/api/import/batches/${batchId}/errors`}>Download error report</a>
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={runRollback}>
                {busy === "rollback" ? "Rolling back…" : "Roll back this batch"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
