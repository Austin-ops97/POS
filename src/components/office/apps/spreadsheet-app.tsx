"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Download, FilePlus2, FolderOpen, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { columnName, evaluateFormula, parseCsv, toCsv, type SheetGrid } from "@/lib/office/spreadsheet";
import { OfficeAppHeader } from "./app-header";
import { createWorkspaceRecord, downloadText, recordMetadata, updateWorkspaceRecord, type OfficeAppPermissions } from "./record-client";

const ROWS = 20;
const COLS = 10;
const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(""));
type SheetData = { grid: SheetGrid };

export function SpreadsheetApp({ module, initialRecords, permissions }: { module: OfficeSuiteModule; initialRecords: OfficeWorkspaceRecordSummary[]; permissions: OfficeAppPermissions }) {
  const [records, setRecords] = useState(initialRecords);
  const [activeId, setActiveId] = useState(initialRecords[0]?.id ?? "");
  const active = records.find((record) => record.id === activeId);
  const [title, setTitle] = useState(active?.title ?? "Untitled workbook");
  const [grid, setGrid] = useState<SheetGrid>(() => recordMetadata<SheetData>(active, { grid: emptyGrid() }).grid);
  const [selected, setSelected] = useState("A1");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const columns = useMemo(() => Array.from({ length: grid[0]?.length ?? COLS }, (_, i) => columnName(i)), [grid]);

  function open(record?: OfficeWorkspaceRecordSummary) {
    setActiveId(record?.id ?? "");
    setTitle(record?.title ?? "Untitled workbook");
    setGrid(recordMetadata<SheetData>(record, { grid: emptyGrid() }).grid);
  }
  function updateCell(row: number, col: number, value: string) {
    setGrid((current) => current.map((cells, index) => index === row ? cells.map((cell, c) => c === col ? value : cell) : cells));
  }
  async function save() {
    if (!permissions.canCreate || (active && !permissions.canEdit)) return;
    setSaving(true);
    try {
      const saved = active
        ? await updateWorkspaceRecord(module.slug, active.id, { title, metadata: { grid } })
        : await createWorkspaceRecord(module.slug, { title, summary: `${ROWS} row workbook`, metadata: { grid } });
      setRecords((current) => active ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setActiveId(saved.id);
      toast.success("Workbook saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save workbook"); }
    finally { setSaving(false); }
  }
  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const parsed = parseCsv(await file.text());
    setGrid(Array.from({ length: Math.max(ROWS, parsed.length) }, (_, row) => Array.from({ length: Math.max(COLS, parsed[0]?.length ?? 0) }, (_, col) => parsed[row]?.[col] ?? "")));
    setTitle(file.name.replace(/\.csv$/i, ""));
    toast.success("CSV imported. Save to keep it.");
    event.target.value = "";
  }
  return (
    <div className="space-y-5 pb-8">
      <OfficeAppHeader module={module}>
        <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
        <Button variant="outline" onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4" />Import CSV</Button>
        <Button variant="outline" onClick={() => downloadText(`${title || "workbook"}.csv`, toCsv(grid), "text/csv;charset=utf-8")}><Download className="h-4 w-4" />Export CSV</Button>
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}</Button>
      </OfficeAppHeader>
      <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-slate-200 bg-emerald-950 p-4 text-white lg:border-b-0 lg:border-r">
          <Button className="w-full bg-emerald-500 text-emerald-950 hover:bg-emerald-400" onClick={() => open()} disabled={!permissions.canCreate}><FilePlus2 className="h-4 w-4" />New workbook</Button>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-emerald-300">Saved workbooks</p>
          <div className="mt-2 space-y-1">
            {records.map((record) => <button key={record.id} onClick={() => open(record)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${record.id === activeId ? "bg-white text-emerald-950" : "text-emerald-50 hover:bg-white/10"}`}><FolderOpen className="h-4 w-4 shrink-0" /><span className="truncate">{record.title}</span></button>)}
            {!records.length ? <p className="px-3 py-4 text-sm text-emerald-200">No saved workbooks yet.</p> : null}
          </div>
          <div className="mt-6 rounded-xl bg-white/10 p-3 text-xs leading-5 text-emerald-100">Formulas: <code>=SUM(A1:A5)</code>, <code>=AVERAGE(B1:B5)</code>, <code>=A1*B1</code></div>
        </aside>
        <main className="min-w-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 p-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="max-w-sm border-0 bg-transparent text-base font-semibold shadow-none focus-visible:ring-1" aria-label="Workbook title" />
            <span className="ml-auto rounded-md border bg-white px-2 py-1 font-mono text-xs text-slate-600">{selected}</span>
          </div>
          <div className="overflow-auto pb-4">
            <table className="border-collapse text-sm">
              <thead><tr><th className="sticky left-0 top-0 z-20 h-8 w-12 border-b border-r bg-slate-100" />{columns.map((column) => <th key={column} className="sticky top-0 z-10 min-w-32 border-b border-r bg-slate-100 font-medium text-slate-600">{column}</th>)}</tr></thead>
              <tbody>{grid.map((row, rowIndex) => <tr key={rowIndex}><th className="sticky left-0 z-10 h-9 border-b border-r bg-slate-100 text-xs font-medium text-slate-500">{rowIndex + 1}</th>{row.map((value, colIndex) => { const ref = `${columnName(colIndex)}${rowIndex + 1}`; const computed = value.startsWith("=") ? evaluateFormula(value, grid) : null; return <td key={colIndex} className="border-b border-r p-0"><input value={value} onFocus={() => setSelected(ref)} onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)} title={computed != null ? `Result: ${Number.isFinite(computed) ? computed : "Invalid formula"}` : undefined} className={`h-9 w-32 px-2 outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 ${value.startsWith("=") ? "font-mono text-emerald-700" : ""}`} aria-label={`Cell ${ref}`} /></td>; })}</tr>)}</tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
