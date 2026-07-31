"use client";
/* eslint-disable @next/next/no-img-element -- previews are private authenticated file routes */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, File, FileText, LockKeyhole, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OfficeDocumentDetail } from "./types";

async function apiMessage(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "The request failed";
}

export function OfficeFileDocument({ document, capabilities }: { document: OfficeDocumentDetail; capabilities: { canDelete: boolean } }) {
  const router = useRouter();
  async function remove() {
    if (!window.confirm(`Delete “${document.title}”?`)) return;
    const response = await fetch(`/api/office/documents/${document.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error(await apiMessage(response));
    toast.success("Document deleted"); router.push("/office"); router.refresh();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Button asChild variant="ghost" className="-ml-3"><Link href="/office"><ArrowLeft className="h-4 w-4" />Back to Office</Link></Button><div className="mt-3 flex items-center gap-2"><h1 className="text-3xl font-bold tracking-tight text-slate-950">{document.title}</h1>{document.isSensitive ? <LockKeyhole className="h-5 w-5 text-amber-600" /> : null}</div><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{document.kind === "SCAN" ? "Scanned document" : "Uploaded files"}</Badge><Badge variant="outline">{document.status.toLowerCase()}</Badge><span className="text-xs text-slate-400">{document.files.length} file{document.files.length === 1 ? "" : "s"} · Updated by {document.updatedBy.name}</span></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>{capabilities.canDelete ? <Button variant="outline" onClick={() => void remove()} className="text-red-600"><Trash2 className="h-4 w-4" />Delete</Button> : null}</div></header>

      {document.description ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{document.description}</p> : null}
      {document.files.length ? <div className="grid gap-4 xl:grid-cols-2">{document.files.map((file, index) => {
        const url = `/api/office/files/${file.id}`;
        const image = file.mimeType.startsWith("image/");
        const pdf = file.mimeType === "application/pdf";
        return <article key={file.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center gap-3 border-b border-slate-100 p-3"><div className="rounded-lg bg-slate-100 p-2">{image ? <FileText className="h-4 w-4" /> : <File className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{document.kind === "SCAN" ? `Page ${index + 1}` : file.fileName}</p><p className="text-xs text-slate-400">{(file.sizeBytes / 1024 / 1024).toFixed(1)} MB</p></div><Button asChild variant="ghost" size="icon"><a href={url} download={file.fileName} aria-label={`Download ${file.fileName}`}><Download className="h-4 w-4" /></a></Button></div>{image ? <a href={url} target="_blank" rel="noreferrer">{/* Authenticated dynamic files cannot use the Next image optimizer. */}<img src={url} alt={`${document.title}, page ${index + 1}`} className="mx-auto max-h-[70vh] w-full bg-slate-100 object-contain" /></a> : pdf ? <iframe src={url} title={file.fileName} className="h-[60vh] w-full bg-slate-100" /> : <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center"><File className="h-10 w-10 text-slate-300" /><p className="mt-2 text-sm text-slate-500">Preview is unavailable for this file type.</p><Button asChild variant="outline" className="mt-4"><a href={url} download={file.fileName}><Download className="h-4 w-4" />Download file</a></Button></div>}</article>;
      })}</div> : <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><File className="h-10 w-10 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-800">No files attached</h2><p className="mt-1 text-sm text-slate-500">This document record exists, but its file upload did not finish.</p></div>}
    </div>
  );
}
