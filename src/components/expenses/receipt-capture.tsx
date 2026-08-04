"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, FileUp, RotateCw, Crop, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { detectDocumentCorners, warpDocument } from "@/lib/receipts/document-scanner";
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
  initialAction?: "scan" | "upload";
};

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** Detect the paper boundary, correct perspective, and improve legibility. */
async function enhanceImage(dataUrl: string): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  detected: boolean;
}> {
  const img = await loadImage(dataUrl);
  const analysis = document.createElement("canvas");
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  analysis.width = Math.max(1, Math.round(img.width * scale));
  analysis.height = Math.max(1, Math.round(img.height * scale));
  const analysisContext = analysis.getContext("2d");
  if (!analysisContext) return { dataUrl, width: img.width, height: img.height, detected: false };
  analysisContext.drawImage(img, 0, 0, analysis.width, analysis.height);
  const detectedCorners = detectDocumentCorners(
    analysisContext.getImageData(0, 0, analysis.width, analysis.height)
  );
  const corners = detectedCorners?.map((point) => ({ x: point.x / scale, y: point.y / scale }));
  const scan = corners ? warpDocument(img, corners) : null;
  const canvas = scan?.canvas ?? document.createElement("canvas");
  if (!scan) {
    canvas.width = img.width;
    canvas.height = img.height;
    const fallbackContext = canvas.getContext("2d");
    fallbackContext?.drawImage(img, 0, 0);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl, width: img.width, height: img.height, detected: false };
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = Math.min(255, Math.max(0, (pixels.data[i] - 128) * 1.14 + 128 + 3));
    pixels.data[i + 1] = Math.min(255, Math.max(0, (pixels.data[i + 1] - 128) * 1.14 + 128 + 3));
    pixels.data[i + 2] = Math.min(255, Math.max(0, (pixels.data[i + 2] - 128) * 1.14 + 128 + 3));
  }
  ctx.putImageData(pixels, 0, 0);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.94),
    width: canvas.width,
    height: canvas.height,
    detected: Boolean(scan),
  };
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

export function ReceiptCapture({ onCaptured, onOcrText, className, initialAction }: ReceiptCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
    video.addEventListener("canplay", play, { once: true });
    play();
    return () => {
      video.removeEventListener("loadedmetadata", play);
      video.removeEventListener("canplay", play);
      video.pause();
      video.srcObject = null;
    };
  }, [cameraOpen, stream]);

  async function startCamera() {
    if (cameraStarting || cameraOpen) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera scanning requires HTTPS. You can upload a receipt instead.");
      return;
    }
    setCameraStarting(true);
    setVideoReady(false);
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
      if (!media.getVideoTracks().length) throw new Error("No camera track returned");
      streamRef.current = media;
      setStream(media);
      setCameraOpen(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      toast.error(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Camera access was blocked. Allow camera access in your browser settings, then try again."
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
      for (const file of list) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isImage = file.type.startsWith("image/");
        if ((!isPdf && !isImage) || file.size > MAX_RECEIPT_BYTES) {
          toast.error(
            file.size > MAX_RECEIPT_BYTES
              ? `${file.name} is larger than the 10 MB receipt limit.`
              : `${file.name} is not a supported receipt image or PDF.`
          );
          continue;
        }
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
        if (!enhanced.detected) {
          toast.message("Receipt edges were not clear", {
            description: "The image was enhanced without cropping. You can retake it with the receipt fully visible.",
          });
        }
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
    } catch {
      toast.error("We couldn’t process that receipt. Try a smaller image or PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !videoReady || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const raw = canvas.toDataURL("image/jpeg", 0.92);
    setBusy(true);
    try {
      const enhanced = await enhanceImage(raw);
      setPreview(enhanced.dataUrl);
      stopCamera();
      if (!enhanced.detected) {
        toast.message("Receipt edges were not clear", {
          description: "The image was enhanced without cropping. Try moving closer and placing the receipt on a contrasting surface.",
        });
      }
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
    } catch {
      toast.error("We couldn’t process the scan. Please try again.");
    } finally {
      setBusy(false);
    }
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
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
              onLoadedMetadata={() => setVideoReady(true)}
              onCanPlay={() => setVideoReady(true)}
            />
            {!videoReady ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-sm font-medium text-white">
                <span>Starting camera…</span>
                <Button type="button" variant="secondary" onClick={() => nativeCameraRef.current?.click()}>
                  Use device camera instead
                </Button>
              </div>
            ) : null}
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
              <Button type="button" variant="secondary" size="icon" onClick={stopCamera} aria-label="Close camera">
                <X className="h-5 w-5" />
              </Button>
              <button
                type="button"
                onClick={() => void captureFrame()}
                disabled={!videoReady || busy}
                className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/90 shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="text-base font-semibold text-slate-900">
                {initialAction === "scan" ? "Scan a receipt" : initialAction === "upload" ? "Upload a receipt" : "Scan or upload a receipt"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Camera, drag & drop, images, or multi-page PDFs
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button type="button" onClick={() => void startCamera()} className="min-h-11" autoFocus={initialAction === "scan"}>
                <Camera className="h-4 w-4" />
                Take photo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => imageRef.current?.click()}
                disabled={busy}
                autoFocus={initialAction === "upload"}
              >
                <ImagePlus className="h-4 w-4" />
                Upload image
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => pdfRef.current?.click()}
                disabled={busy}
              >
                <FileUp className="h-4 w-4" />
                Upload PDF
              </Button>
            </div>
          </div>
        )}
        <input
          ref={imageRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={pdfRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={nativeCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.currentTarget.value = "";
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
