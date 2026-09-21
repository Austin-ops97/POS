"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, FileUp, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CornerEditor, type ScanEditResult } from "@/components/scanner/corner-editor";

export type CapturedReceipt = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  width?: number;
  height?: number;
  enhanced?: boolean;
  kind: "IMAGE" | "PDF";
  role?: "ORIGINAL" | "PROCESSED";
  ocrText?: string;
};

type ReceiptCaptureProps = {
  onCaptured: (receipt: CapturedReceipt) => void;
  onOcrText?: (text: string) => void;
  className?: string;
  initialAction?: "scan" | "upload";
};

type ScanPage = ScanEditResult & { id: string };

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bytesOfDataUrl(value: string) {
  const index = value.indexOf(",");
  return index === -1 ? value.length : Math.round(((value.length - index - 1) * 3) / 4);
}

export function ReceiptCapture({ onCaptured, onOcrText, className, initialAction }: ReceiptCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [pages, setPages] = useState<ScanPage[]>([]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setCameraOpen(false);
    setVideoReady(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOpen || !stream || !video) return;
    setVideoReady(false);
    video.srcObject = stream;
    const play = () => {
      setVideoReady(video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
      void video.play().then(() => setVideoReady(true)).catch(() => setVideoReady(false));
    };
    video.addEventListener("loadedmetadata", play, { once: true });
    play();
    return () => {
      video.removeEventListener("loadedmetadata", play);
      video.pause();
      video.srcObject = null;
    };
  }, [cameraOpen, stream]);

  function openEditor(dataUrl: string, rest: string[] = []) {
    setEditing(dataUrl);
    setQueue(rest);
    stopCamera();
  }

  async function startCamera() {
    if (cameraStarting || cameraOpen) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera scanning requires HTTPS. You can upload a receipt instead.");
      return;
    }
    setCameraStarting(true);
    try {
      let media: MediaStream;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (error) {
        if (error instanceof DOMException && ["OverconstrainedError", "NotFoundError"].includes(error.name)) {
          media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw error;
        }
      }
      streamRef.current = media;
      setStream(media);
      setCameraOpen(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      toast.error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera access was blocked. Allow camera access, then try again."
          : "The camera could not be opened. You can upload a receipt instead."
      );
      nativeCameraRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      const images: string[] = [];
      for (const file of list) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isImage = file.type.startsWith("image/");
        if ((!isPdf && !isImage) || file.size > MAX_RECEIPT_BYTES) {
          toast.error(
            file.size > MAX_RECEIPT_BYTES
              ? `${file.name} is larger than 8 MB.`
              : `${file.name} is not a supported receipt image or PDF.`
          );
          continue;
        }
        const storageUrl = await readFile(file);
        if (isPdf) {
          onCaptured({
            fileName: file.name,
            mimeType: "application/pdf",
            sizeBytes: file.size,
            storageUrl,
            kind: "PDF",
            role: "ORIGINAL",
          });
          continue;
        }
        images.push(storageUrl);
      }
      if (images.length) openEditor(images[0]!, images.slice(1));
    } catch {
      toast.error("We couldn’t read that receipt. Try a smaller image or PDF.");
    } finally {
      setBusy(false);
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    openEditor(canvas.toDataURL("image/jpeg", 0.9));
  }

  function acceptPage(result: ScanEditResult) {
    setPages((current) => [...current, { ...result, id: crypto.randomUUID() }]);
    if (queue.length) {
      setEditing(queue[0]!);
      setQueue((current) => current.slice(1));
      return;
    }
    setEditing(null);
  }

  async function finishPages() {
    if (!pages.length) return;
    setBusy(true);
    try {
      pages.forEach((page, index) => {
        onCaptured({
          fileName: `receipt-original-${index + 1}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: bytesOfDataUrl(page.originalDataUrl),
          storageUrl: page.originalDataUrl,
          kind: "IMAGE",
          role: "ORIGINAL",
        });
      });
      const response = await fetch("/api/expenses/receipts/compose", {
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? "The cleaned PDF could not be created. Original photos are still attached.");
        return;
      }
      onCaptured({
        fileName: payload.fileName,
        mimeType: "application/pdf",
        sizeBytes: payload.sizeBytes,
        storageUrl: payload.storageUrl,
        kind: "PDF",
        role: "PROCESSED",
        enhanced: true,
      });
      toast.success(pages.length > 1 ? "Pages combined into one PDF" : "Cleaned receipt PDF is ready");
      setPages([]);
    } catch {
      toast.error("The cleaned PDF could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-slate-50 to-white p-4",
          dragOver && "border-slate-900 bg-slate-100"
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (event.dataTransfer.files?.length) void handleFiles(event.dataTransfer.files);
        }}
      >
        {editing ? (
          <CornerEditor imageSrc={editing} onCancel={() => setEditing(null)} onApply={acceptPage} />
        ) : cameraOpen ? (
          <div className="relative aspect-[3/4] max-h-[420px] overflow-hidden rounded-xl bg-black sm:aspect-video">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay onCanPlay={() => setVideoReady(true)} />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 bg-gradient-to-t from-black/70 p-4">
              <Button type="button" variant="secondary" size="icon" onClick={stopCamera} aria-label="Close camera">
                <X className="h-5 w-5" />
              </Button>
              <button
                type="button"
                onClick={captureFrame}
                disabled={!videoReady}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/90"
                aria-label="Capture receipt"
              >
                <span className="h-12 w-12 rounded-full bg-slate-900" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">
                {initialAction === "scan" ? "Scan a receipt" : "Scan or upload a receipt"}
              </p>
              <p className="mt-1 text-sm text-slate-500">Adjust corners, then save a cleaned PDF and the original photo.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" className="min-h-11" onClick={() => void startCamera()}>
                <Camera className="h-4 w-4" />
                Take photo
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => imageRef.current?.click()} disabled={busy}>
                <ImagePlus className="h-4 w-4" />
                Upload image
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => pdfRef.current?.click()} disabled={busy}>
                <FileUp className="h-4 w-4" />
                Upload PDF
              </Button>
            </div>
          </div>
        )}
        <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); event.currentTarget.value = ""; }} />
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); event.currentTarget.value = ""; }} />
        <input ref={nativeCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); event.currentTarget.value = ""; }} />
      </div>
      {pages.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-800">{pages.length} page{pages.length === 1 ? "" : "s"} ready</p>
          <div className="flex gap-2 overflow-x-auto">
            {pages.map((page, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={page.id} src={page.processedDataUrl} alt={`Page ${index + 1}`} className="h-20 w-16 rounded-md object-cover" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void finishPages()}>
              <Check className="h-4 w-4" />
              {busy ? "Building PDF…" : "Attach original and PDF"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void startCamera()}>
              Add page
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPages([])}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Paste receipt text to extract fields. Nothing is applied until you confirm it.
        </span>
        <textarea
          className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-slate-900/10 focus:ring-2"
          placeholder="Merchant, date, totals, and line items…"
          onBlur={(event) => {
            if (event.target.value.trim()) onOcrText?.(event.target.value);
          }}
        />
      </label>
    </div>
  );
}
