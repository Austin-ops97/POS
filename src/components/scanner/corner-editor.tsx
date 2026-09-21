"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCw, Check, X } from "lucide-react";
import {
  applyDocumentFilter,
  detectDocumentCorners,
  warpDocument,
  type DocumentColorMode,
  type ScannerPoint,
} from "@/lib/receipts/document-scanner";

export type ScanEditResult = {
  originalDataUrl: string;
  processedDataUrl: string;
  width: number;
  height: number;
};

type CornerEditorProps = {
  imageSrc: string;
  onCancel: () => void;
  onApply: (result: ScanEditResult) => void;
};

const MODES: Array<{ id: DocumentColorMode; label: string }> = [
  { id: "color", label: "Color" },
  { id: "grayscale", label: "Gray" },
  { id: "bw", label: "B&W" },
  { id: "contrast", label: "Contrast" },
];

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function fallbackCorners(width: number, height: number): ScannerPoint[] {
  const x = width * 0.08;
  const y = height * 0.08;
  return [
    { x, y },
    { x: width - x, y },
    { x: width - x, y: height - y },
    { x, y: height - y },
  ];
}

export function CornerEditor({ imageSrc, onCancel, onApply }: CornerEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [src, setSrc] = useState(imageSrc);
  const [natural, setNatural] = useState({ width: 1, height: 1 });
  const [corners, setCorners] = useState<ScannerPoint[]>([]);
  const [mode, setMode] = useState<DocumentColorMode>("color");
  const [contrast, setContrast] = useState(1.12);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const image = await loadImage(src);
      if (cancelled) return;
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      const sample = document.createElement("canvas");
      const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
      sample.width = Math.max(1, Math.round(image.naturalWidth * scale));
      sample.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = sample.getContext("2d");
      const detected = context
        ? (context.drawImage(image, 0, 0, sample.width, sample.height),
          detectDocumentCorners(context.getImageData(0, 0, sample.width, sample.height)))
        : null;
      setCorners(
        detected?.map((point) => ({ x: point.x / scale, y: point.y / scale })) ??
          fallbackCorners(image.naturalWidth, image.naturalHeight)
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  function pointFromEvent(event: React.PointerEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(natural.width, Math.max(0, ((event.clientX - rect.left) / rect.width) * natural.width)),
      y: Math.min(natural.height, Math.max(0, ((event.clientY - rect.top) / rect.height) * natural.height)),
    };
  }

  async function rotate() {
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalHeight;
    canvas.height = image.naturalWidth;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI / 2);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    setSrc(canvas.toDataURL("image/jpeg", 0.92));
  }

  async function apply() {
    setBusy(true);
    try {
      const image = await loadImage(src);
      const scan = corners.length === 4 ? warpDocument(image, corners) : null;
      const canvas = scan?.canvas ?? document.createElement("canvas");
      if (!scan) {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      applyDocumentFilter(pixels.data, mode, contrast);
      context.putImageData(pixels, 0, 0);
      onApply({
        originalDataUrl: src,
        processedDataUrl: canvas.toDataURL("image/jpeg", 0.86),
        width: canvas.width,
        height: canvas.height,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative inline-block max-w-full">
        {/* Local scan preview, not a remote image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Adjust the document corners" className="max-h-[60vh] max-w-full rounded-xl bg-slate-900" />
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full touch-none"
          viewBox={`0 0 ${natural.width} ${natural.height}`}
          preserveAspectRatio="none"
          onPointerMove={(event) => {
            if (drag == null) return;
            const point = pointFromEvent(event);
            if (!point) return;
            setCorners((current) => current.map((corner, index) => (index === drag ? point : corner)));
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          {corners.length === 4 ? (
            <polygon
              points={corners.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="rgba(16,185,129,0.18)"
              stroke="#047857"
              strokeWidth={Math.max(2, natural.width / 180)}
            />
          ) : null}
          {corners.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={Math.max(14, natural.width / 36)}
              fill="#047857"
              stroke="white"
              strokeWidth={Math.max(3, natural.width / 240)}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag(index);
              }}
            />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {MODES.map((item) => (
          <Button key={item.id} type="button" size="sm" variant={mode === item.id ? "default" : "outline"} onClick={() => setMode(item.id)}>
            {item.label}
          </Button>
        ))}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Contrast
          <input
            type="range"
            min={0.8}
            max={2}
            step={0.05}
            value={contrast}
            onChange={(event) => setContrast(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void rotate()}>
          <RotateCw className="h-4 w-4" />
          Rotate
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setCorners(fallbackCorners(natural.width, natural.height))}>
          Reset corners
        </Button>
        <Button type="button" size="sm" disabled={busy || corners.length !== 4} onClick={() => void apply()}>
          <Check className="h-4 w-4" />
          {busy ? "Processing…" : "Use this page"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
      <p className="text-xs text-slate-500">Drag the corners onto the paper. The area outside the outline is cropped, then the page is straightened.</p>
    </div>
  );
}
