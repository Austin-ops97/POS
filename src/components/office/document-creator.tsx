"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, FileUp, LayoutTemplate, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { OfficeFolderSummary } from "./types";

type Mode = "RICH_TEXT" | "UPLOAD" | "TEMPLATE";

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Unable to create the document";
}

export function OfficeDocumentCreator({ folders, canManageTemplates }: { folders: OfficeFolderSummary[]; canManageTemplates: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("RICH_TEXT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return toast.error("Enter a document title");
    if (mode === "UPLOAD" && !files.length) return toast.error("Choose at least one file");
    setBusy(true);
    try {
      const response = await fetch("/api/office/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          folderId: folderId || null,
          kind: mode,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const document = await response.json();
      for (let index = 0; index < files.length; index += 1) {
        const form = new FormData();
        form.append("file", files[index]);
        form.append("sortOrder", String(index));
        const upload = await fetch(`/api/office/documents/${document.id}/files`, { method: "POST", body: form });
        if (!upload.ok) throw new Error(await errorMessage(upload));
      }
      toast.success(mode === "UPLOAD" ? "Files saved" : "Document created");
      router.push(`/office/documents/${document.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><Button asChild variant="ghost" className="-ml-3"><Link href="/office"><ArrowLeft className="h-4 w-4" />Back to Office</Link></Button><p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Office</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">New document</h1><p className="mt-1 text-sm text-slate-500">Start a formatted internal document or securely upload existing files.</p></div>

      <div className={cn("grid gap-3 sm:grid-cols-2", canManageTemplates && "xl:grid-cols-3")}>
        <button type="button" onClick={() => setMode("RICH_TEXT")} className={cn("rounded-2xl border bg-white p-5 text-left transition", mode === "RICH_TEXT" ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200 hover:border-slate-300")}><FileText className="h-7 w-7 text-slate-800" /><h2 className="mt-4 font-semibold text-slate-950">Blank document</h2><p className="mt-1 text-sm text-slate-500">Write policies, letters, SOPs, notes, and checklists.</p></button>
        <button type="button" onClick={() => setMode("UPLOAD")} className={cn("rounded-2xl border bg-white p-5 text-left transition", mode === "UPLOAD" ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200 hover:border-slate-300")}><FileUp className="h-7 w-7 text-slate-800" /><h2 className="mt-4 font-semibold text-slate-950">Upload files</h2><p className="mt-1 text-sm text-slate-500">Store PDFs, images, Word files, and plain-text records.</p></button>
        {canManageTemplates ? <button type="button" onClick={() => setMode("TEMPLATE")} className={cn("rounded-2xl border bg-white p-5 text-left transition", mode === "TEMPLATE" ? "border-slate-950 ring-2 ring-slate-950/10" : "border-slate-200 hover:border-slate-300")}><LayoutTemplate className="h-7 w-7 text-slate-800" /><h2 className="mt-4 font-semibold text-slate-950">Reusable template</h2><p className="mt-1 text-sm text-slate-500">Build a standard starting point for recurring documents.</p></button> : null}
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="space-y-2"><Label htmlFor="office-title">Title</Label><Input id="office-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder={mode === "UPLOAD" ? "2026 insurance certificate" : mode === "TEMPLATE" ? "Incident report template" : "Employee handbook"} className="h-11 rounded-xl" autoFocus /></div>
        <div className="space-y-2"><Label htmlFor="office-description">Description <span className="font-normal text-slate-400">(optional)</span></Label><Textarea id="office-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="What this document contains and who should use it" className="min-h-24 rounded-xl" /></div>
        <div className="space-y-2"><Label htmlFor="office-folder">Folder</Label><select id="office-folder" value={folderId} onChange={(event) => setFolderId(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></div>
        {mode === "UPLOAD" ? <div className="space-y-2"><Label>Files</Label><button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:bg-slate-100"><UploadCloud className="h-7 w-7 text-slate-500" /><span className="mt-2 text-sm font-medium text-slate-700">Choose files</span><span className="mt-1 text-xs text-slate-400">PDF, JPG, PNG, WebP, HEIC, DOCX, or TXT · 10 MB each</span></button><input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx,.txt" className="hidden" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />{files.length ? <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{files.map((file) => <li key={`${file.name}-${file.size}`} className="truncate">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</li>)}</ul> : null}</div> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button asChild variant="outline"><Link href="/office">Cancel</Link></Button><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{mode === "UPLOAD" ? "Upload and save" : mode === "TEMPLATE" ? "Create template" : "Create document"}</Button></div>
      </form>
    </div>
  );
}
