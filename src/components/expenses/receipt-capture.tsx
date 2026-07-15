"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, FileUp, RotateCw, Crop, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type CapturedReceipt = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  width?: number;
  height?: number;
  enhanced?: boolean;
  kind: "IMAGE" | "PDF";
  ocrText?: string;
};

type ReceiptCaptureProps = {
  onCaptured: (receipt: CapturedReceipt) => void;
  onOcrText?: (text: string) => void;
  className?: string;
};

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Simple contrast/brightness enhancement + center auto-crop simulation. */
async function enhanceImage(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const marginX = Math.round(img.width * 0.04);
  const marginY = Math.round(img.height * 0.04);
  const width = Math.max(1, img.width - marginX * 2);
  const height = Math.max(1, img.height - marginY * 2);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl, width: img.width, height: img.height };
  ctx.filter = "contrast(1.12) brightness(1.04) saturate(1.05)";
  ctx.drawImage(img, marginX, marginY, width, height, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width, height };
}

async function rotateImage(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.height;
  canvas.height = img.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function ReceiptCapture({ onCaptured, onOcrText, className }: ReceiptCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraOpen(false);
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(media);
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          void videoRef.current.play();
        }
      });
    } catch {
      toast.error("Camera access denied. You can upload a photo instead.");
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const storageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        if (isPdf) {
          onCaptured({
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            sizeBytes: file.size,
            storageUrl,
            kind: "PDF",
          });
          continue;
        }

        const enhanced = await enhanceImage(storageUrl);
        setPreview(enhanced.dataUrl);
        onCaptured({
          fileName: file.name,
          mimeType: "image/jpeg",
          sizeBytes: Math.round((enhanced.dataUrl.length * 3) / 4),
          storageUrl: enhanced.dataUrl,
          width: enhanced.width,
          height: enhanced.height,
          enhanced: true,
          kind: "IMAGE",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const raw = canvas.toDataURL("image/jpeg", 0.92);
    const enhanced = await enhanceImage(raw);
    setPreview(enhanced.dataUrl);
    stopCamera();
    onCaptured({
      fileName: `receipt-${Date.now()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: Math.round((enhanced.dataUrl.length * 3) / 4),
      storageUrl: enhanced.dataUrl,
      width: enhanced.width,
      height: enhanced.height,
      enhanced: true,
      kind: "IMAGE",
    });
  }

  async function rotatePreview() {
    if (!preview) return;
    const rotated = await rotateImage(preview);
    setPreview(rotated);
    onCaptured({
      fileName: `receipt-${Date.now()}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: Math.round((rotated.length * 3) / 4),
      storageUrl: rotated,
      enhanced: true,
      kind: "IMAGE",
    });
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-slate-50 to-white p-4 transition-all",
          dragOver && "border-slate-900 bg-slate-100"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
      >
        {cameraOpen ? (
          <div className="relative aspect-[3/4] max-h-[420px] overflow-hidden rounded-xl bg-black sm:aspect-video">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
              <Button type="button" variant="secondary" size="icon" onClick={stopCamera} aria-label="Close camera">
                <X className="h-5 w-5" />
              </Button>
              <button
                type="button"
                onClick={() => void captureFrame()}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/90 shadow-lg transition hover:scale-105"
                aria-label="Capture receipt"
              >
                <span className="h-12 w-12 rounded-full bg-slate-900" />
              </button>
              <Button type="button" variant="secondary" size="icon" disabled aria-label="Auto edge detect active">
                <Crop className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ) : preview ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Receipt preview"
              className="mx-auto max-h-72 rounded-xl object-contain shadow-sm"
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void rotatePreview()}>
                <RotateCw className="h-4 w-4" />
                Rotate
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setPreview(null)}>
                Retake
              </Button>
              <Button type="button" size="sm" onClick={() => toast.success("Receipt ready to save")}>
                <Check className="h-4 w-4" />
                Use photo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-900">Scan or upload a receipt</p>
              <p className="mt-1 text-sm text-slate-500">
                Camera, drag & drop, images, or multi-page PDFs
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button type="button" onClick={() => void startCamera()} className="min-h-11">
                <Camera className="h-4 w-4" />
                Take photo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <ImagePlus className="h-4 w-4" />
                Upload image
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                <FileUp className="h-4 w-4" />
                Upload PDF
              </Button>
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
          }}
        />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">
          Paste OCR / receipt text (optional — auto-fills the form)
        </span>
        <textarea
          className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-slate-900/10 focus:ring-2"
          placeholder="Paste receipt text to auto-detect merchant, date, total…"
          onBlur={(e) => {
            if (e.target.value.trim()) onOcrText?.(e.target.value);
          }}
        />
      </label>
    </div>
  );
}
