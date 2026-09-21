"use client";
/* eslint-disable @next/next/no-img-element -- scan previews are local data URLs */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Camera, Check, FileImage, Images, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CornerEditor, type ScanEditResult } from "@/components/scanner/corner-editor";
import type { OfficeFolderSummary } from "./types";

type ScanPage = {
  id: string;
  originalDataUrl: string;
  processedDataUrl: string;
  width: number;
  height: number;
};

function dataUrlToFile(dataUrl: string, name: string, type: string) {
  const comma = dataUrl.indexOf(",");
  const binary = atob(dataUrl.slice(comma + 1).replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type });
}

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** Keep the untouched capture, resized only so the upload stays within the document limit. */
async function imageFileToDataUrl(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [title, setTitle] = useState(`Scanned document ${new Date().toLocaleDateString()}`);
  const [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = queue[0] ?? null;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      toast.error("Camera access is unavailable. Upload photos instead.");
    }
  }

  function enqueue(dataUrl: string) {
    setQueue((items) => [...items, dataUrl]);
  }

  async function addFiles(files: File[]) {
    setBusy(true);
    try {
      const images: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        images.push(await imageFileToDataUrl(file));
      }
      if (!images.length) {
        toast.error("Choose a photo of the document");
        return;
      }
      setQueue((items) => [...items, ...images]);
      stopCamera();
    } catch {
      toast.error("One of the selected images could not be processed");
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    const sourceWidth = video.videoWidth || 1920;
    const sourceHeight = video.videoHeight || 1080;
    const scale = Math.min(1, 2400 / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    enqueue(canvas.toDataURL("image/jpeg", 0.9));
    stopCamera();
  }

  function acceptPage(result: ScanEditResult) {
    setPages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        originalDataUrl: result.originalDataUrl,
        processedDataUrl: result.processedDataUrl,
        width: result.width,
        height: result.height,
      },
    ]);
    setQueue((items) => items.slice(1));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    setPages((items) => {
      const copy = [...items];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  async function uploadFile(documentId: string, file: File, sortOrder: number, width?: number, height?: number) {
    const form = new FormData();
    form.append("file", file);
    form.append("sortOrder", String(sortOrder));
    if (width) form.append("width", String(width));
    if (height) form.append("height", String(height));
    const upload = await fetch(`/api/office/documents/${documentId}/files`, { method: "POST", body: form });
    if (!upload.ok) throw new Error(await apiError(upload));
  }

  async function save() {
    if (!title.trim()) return toast.error("Enter a document title");
    if (!pages.length) return toast.error("Scan or add at least one page");
    if (pages.length > 12) return toast.error("A scanned document can include up to 12 pages");
    setBusy(true);
    try {
      const create = await fetch("/api/office/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          kind: "SCAN",
          folderId: folderId || null,
          description: `${pages.length} scanned page${pages.length === 1 ? "" : "s"}. Original photos plus a cleaned PDF.`,
        }),
      });
      if (!create.ok) throw new Error(await apiError(create));
      const document = await create.json();
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        await uploadFile(
          document.id,
          dataUrlToFile(page.originalDataUrl, `original-page-${index + 1}.jpg`, "image/jpeg"),
          index
        );
      }
      const compose = await fetch("/api/expenses/receipts/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: pages.map((page) => ({
            dataUrl: page.processedDataUrl,
            width: page.width,
            height: page.height,
          })),
        }),
      });
      if (!compose.ok) throw new Error(await apiError(compose));
      const pdf = await compose.json();
      await uploadFile(
        document.id,
        dataUrlToFile(pdf.storageUrl, `${title.trim().slice(0, 80) || "scan"}.pdf`, "application/pdf"),
        pages.length
      );
      toast.success("Scanned document saved");
      router.push(`/office/documents/${document.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The scan could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" className="-ml-3">
            <Link href="/office">
              <ArrowLeft className="h-4 w-4" />
              Back to Office
            </Link>
          </Button>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Office</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Scan document</h1>
          <p className="mt-1 text-sm text-slate-500">
            Line up the corners, choose color, gray, or black and white, then save the original photos with one cleaned PDF.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={busy || !pages.length || Boolean(editing)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save {pages.length ? `${pages.length} page${pages.length === 1 ? "" : "s"}` : "scan"}
        </Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          {editing ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                Adjust page {pages.length + 1}
                {queue.length > 1 ? ` · ${queue.length - 1} more waiting` : ""}
              </p>
              <CornerEditor
                key={editing}
                imageSrc={editing}
                onCancel={() => setQueue((items) => items.slice(1))}
                onApply={acceptPage}
              />
            </div>
          ) : cameraOpen ? (
            <div className="relative aspect-[3/4] max-h-[70vh] overflow-hidden rounded-xl bg-black sm:aspect-video">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-5 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.25)]" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/80 p-5 pt-12">
                <Button variant="secondary" size="icon" onClick={stopCamera}>
                  <X className="h-5 w-5" />
                </Button>
                <button type="button" onClick={() => void capture()} className="h-16 w-16 rounded-full border-4 border-white bg-white/25 p-1">
                  <span className="block h-full w-full rounded-full bg-white" />
                </button>
                <div className="h-10 w-10" />
              </div>
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <div className="rounded-2xl bg-slate-900 p-4 text-white">
                <FileImage className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Add your first page</h2>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Use the rear camera on a phone or tablet, or select existing document photos. You can drag the corners before each page is added.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={() => void startCamera()}>
                  <Camera className="h-4 w-4" />
                  Open camera
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Images className="h-4 w-4" />
                  Choose photos
                </Button>
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void addFiles(Array.from(event.target.files));
              event.target.value = "";
            }}
          />
        </section>
        <aside className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="space-y-2">
              <Label htmlFor="scan-title">Document title</Label>
              <Input id="scan-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scan-folder">Folder</Label>
              <select
                id="scan-folder"
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">No folder</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500">
              Color, grayscale, black and white, contrast, and rotation are chosen while you adjust each page.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Pages ({pages.length})</h2>
              {pages.length && !editing ? (
                <Button variant="outline" size="sm" onClick={() => void startCamera()}>
                  <Camera className="h-4 w-4" />
                  Add page
                </Button>
              ) : null}
            </div>
            {pages.map((page, index) => (
              <div key={page.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
                <img src={page.processedDataUrl} alt={`Page ${index + 1}`} className="h-16 w-12 rounded-lg bg-slate-100 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">Page {index + 1}</p>
                  <p className="text-xs text-slate-400">
                    {page.width} × {page.height}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-md p-1.5 text-slate-500 disabled:opacity-20">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === pages.length - 1} className="rounded-md p-1.5 text-slate-500 disabled:opacity-20">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPages((items) => items.filter((item) => item.id !== page.id))}
                    className="col-span-2 rounded-md p-1.5 text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {pages.length && !editing ? (
              <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                <Images className="h-4 w-4" />
                Add from photos
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
