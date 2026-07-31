"use client";
/* eslint-disable @next/next/no-img-element -- scan previews are local object URLs */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Camera, Check, FileImage, Images, Loader2, RotateCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { OfficeFolderSummary } from "./types";

type FilterMode = "color" | "grayscale" | "contrast";
type ScanPage = { id: string; file: File; preview: string; width: number; height: number };

function canvasFilter(mode: FilterMode) {
  if (mode === "grayscale") return "grayscale(1) contrast(1.08)";
  if (mode === "contrast") return "grayscale(1) contrast(1.7) brightness(1.1)";
  return "contrast(1.08) brightness(1.03)";
}

async function imageFileToPage(file: File, mode: FilterMode): Promise<ScanPage> {
  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const item = new Image();
    item.onload = () => resolve(item);
    item.onerror = reject;
    item.src = url;
  });
  const maxDimension = 2400;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable");
  context.filter = canvasFilter(mode);
  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(url);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to process image")), "image/jpeg", 0.9));
  const processed = new File([blob], `scan-${Date.now()}-${crypto.randomUUID().slice(0, 6)}.jpg`, { type: "image/jpeg" });
  return { id: crypto.randomUUID(), file: processed, preview: URL.createObjectURL(processed), width, height };
}

async function rotatePage(page: ScanPage): Promise<ScanPage> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const item = new Image(); item.onload = () => resolve(item); item.onerror = reject; item.src = page.preview;
  });
  const canvas = document.createElement("canvas"); canvas.width = image.naturalHeight; canvas.height = image.naturalWidth;
  const context = canvas.getContext("2d"); if (!context) return page;
  context.translate(canvas.width / 2, canvas.height / 2); context.rotate(Math.PI / 2); context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to rotate page")), "image/jpeg", 0.9));
  URL.revokeObjectURL(page.preview);
  const file = new File([blob], page.file.name, { type: "image/jpeg" });
  return { ...page, file, preview: URL.createObjectURL(file), width: canvas.width, height: canvas.height };
}

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "The scan could not be saved";
}

export function OfficeScanner({ folders }: { folders: OfficeFolderSummary[] }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pagesRef = useRef<ScanPage[]>([]);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("color");
  const [title, setTitle] = useState(`Scanned document ${new Date().toLocaleDateString()}`);
  const [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraOpen(false); }, []);
  useEffect(() => () => { stopCamera(); pagesRef.current.forEach((page) => URL.revokeObjectURL(page.preview)); }, [stopCamera]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
      streamRef.current = stream; setCameraOpen(true);
      requestAnimationFrame(() => { if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); } });
    } catch { toast.error("Camera access is unavailable. Upload photos instead."); }
  }

  async function addFiles(files: File[]) {
    setBusy(true);
    try {
      const processed: ScanPage[] = [];
      for (const file of files) processed.push(await imageFileToPage(file, filter));
      setPages((items) => [...items, ...processed]);
    } catch { toast.error("One of the selected images could not be processed"); }
    finally { setBusy(false); }
  }

  async function capture() {
    const video = videoRef.current; if (!video) return;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth || 1920; canvas.height = video.videoHeight || 1080;
    const context = canvas.getContext("2d"); if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to capture page")), "image/jpeg", 0.92));
    await addFiles([new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" })]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction; if (target < 0 || target >= pages.length) return;
    setPages((items) => { const copy = [...items]; [copy[index], copy[target]] = [copy[target], copy[index]]; return copy; });
  }

  async function save() {
    if (!title.trim()) return toast.error("Enter a document title");
    if (!pages.length) return toast.error("Scan or add at least one page");
    setBusy(true);
    try {
      const create = await fetch("/api/office/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), kind: "SCAN", folderId: folderId || null, description: `${pages.length} scanned page${pages.length === 1 ? "" : "s"}` }) });
      if (!create.ok) throw new Error(await apiError(create));
      const document = await create.json();
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index]; const form = new FormData(); form.append("file", page.file); form.append("sortOrder", String(index)); form.append("width", String(page.width)); form.append("height", String(page.height));
        const upload = await fetch(`/api/office/documents/${document.id}/files`, { method: "POST", body: form });
        if (!upload.ok) throw new Error(await apiError(upload));
      }
      toast.success("Scanned document saved"); router.push(`/office/documents/${document.id}`); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "The scan could not be saved"); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><Button asChild variant="ghost" className="-ml-3"><Link href="/office"><ArrowLeft className="h-4 w-4" />Back to Office</Link></Button><p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Office</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Scan document</h1><p className="mt-1 text-sm text-slate-500">Capture multiple pages, enhance them, arrange their order, and save securely.</p></div><Button onClick={() => void save()} disabled={busy || !pages.length}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save {pages.length ? `${pages.length} page${pages.length === 1 ? "" : "s"}` : "scan"}</Button></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          {cameraOpen ? <div className="relative aspect-[3/4] max-h-[70vh] overflow-hidden rounded-xl bg-black sm:aspect-video"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" /><div className="pointer-events-none absolute inset-5 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.25)]" /><div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/80 p-5 pt-12"><Button variant="secondary" size="icon" onClick={stopCamera}><X className="h-5 w-5" /></Button><button type="button" onClick={() => void capture()} className="h-16 w-16 rounded-full border-4 border-white bg-white/25 p-1"><span className="block h-full w-full rounded-full bg-white" /></button><div className="h-10 w-10" /></div></div> : <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><div className="rounded-2xl bg-slate-900 p-4 text-white"><FileImage className="h-7 w-7" /></div><h2 className="mt-4 text-lg font-semibold text-slate-900">Add your first page</h2><p className="mt-1 max-w-md text-sm text-slate-500">Use the rear camera on a phone or tablet, or select existing document photos.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button onClick={() => void startCamera()}><Camera className="h-4 w-4" />Open camera</Button><Button variant="outline" onClick={() => fileRef.current?.click()}><Images className="h-4 w-4" />Choose photos</Button></div></div>}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { if (event.target.files) void addFiles(Array.from(event.target.files)); event.target.value = ""; }} />
        </section>
        <aside className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4"><div className="space-y-2"><Label htmlFor="scan-title">Document title</Label><Input id="scan-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} /></div><div className="space-y-2"><Label htmlFor="scan-folder">Folder</Label><select id="scan-folder" value={folderId} onChange={(event) => setFolderId(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></div><div><Label>Enhancement</Label><div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">{(["color", "grayscale", "contrast"] as FilterMode[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={cn("rounded-lg px-2 py-2 text-xs capitalize", filter === item ? "bg-white font-semibold shadow-sm" : "text-slate-500")}>{item}</button>)}</div><p className="mt-2 text-xs text-slate-400">Applies to newly captured pages.</p></div></div>
          <div className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Pages ({pages.length})</h2>{pages.length ? <Button variant="outline" size="sm" onClick={() => void startCamera()}><Camera className="h-4 w-4" />Add page</Button> : null}</div>{pages.map((page, index) => <div key={page.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">{/* Local object URLs cannot use the Next image optimizer. */}<img src={page.preview} alt={`Page ${index + 1}`} className="h-16 w-12 rounded-lg bg-slate-100 object-cover" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">Page {index + 1}</p><p className="text-xs text-slate-400">{page.width} × {page.height}</p></div><div className="grid grid-cols-2 gap-1"><button onClick={() => move(index, -1)} disabled={index === 0} className="rounded-md p-1.5 text-slate-500 disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button><button onClick={() => move(index, 1)} disabled={index === pages.length - 1} className="rounded-md p-1.5 text-slate-500 disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button><button onClick={async () => { const rotated = await rotatePage(page); setPages((items) => items.map((item) => item.id === page.id ? rotated : item)); }} className="rounded-md p-1.5 text-slate-500"><RotateCw className="h-4 w-4" /></button><button onClick={() => { URL.revokeObjectURL(page.preview); setPages((items) => items.filter((item) => item.id !== page.id)); }} className="rounded-md p-1.5 text-red-500"><Trash2 className="h-4 w-4" /></button></div></div>)}{pages.length ? <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}><Images className="h-4 w-4" />Add from photos</Button> : null}</div>
        </aside>
      </div>
    </div>
  );
}
