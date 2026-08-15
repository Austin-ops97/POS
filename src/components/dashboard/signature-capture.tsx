"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const DEFAULT_CONSENT = "I acknowledge and approve this transaction.";

type SignatureCaptureProps = {
  orderId: string;
  signerName?: string | null;
  variant?: "default" | "compact";
  onSaved?: () => void;
  onSkip?: () => void;
};

export function SignatureCapture({
  orderId,
  signerName: initialSignerName,
  variant = "default",
  onSaved,
  onSkip,
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signerName, setSignerName] = useState(initialSignerName ?? "");
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT);
  const [saving, setSaving] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [captured, setCaptured] = useState(false);
  const compact = variant === "compact";

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || captured) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    if (event.type === "pointerdown") ctx.beginPath();
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  async function save() {
    if (!signerName.trim() || !hasInk) {
      toast.error("Enter the signer name and capture a signature");
      return;
    }
    const signatureData = canvasRef.current?.toDataURL("image/png");
    if (!signatureData) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName, consentText, dataFormat: "PNG", signatureData }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        toast.error(error?.error ?? "Failed to save signature");
        return;
      }
      toast.success("Signature captured");
      setCaptured(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  if (captured) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Signature captured for {signerName.trim() || "this order"}.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <label className="space-y-2 text-sm font-medium">
          <Label>Signer name</Label>
          <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        </label>
        {!compact && (
          <label className="space-y-2 text-sm font-medium">
            <Label>Consent statement</Label>
            <Input value={consentText} onChange={(e) => setConsentText(e.target.value)} />
          </label>
        )}
      </div>
      {compact && (
        <p className="text-left text-xs text-slate-500">{consentText}</p>
      )}
      <canvas
        ref={canvasRef}
        width={compact ? 640 : 900}
        height={compact ? 160 : 240}
        className={cn(
          "w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white",
          compact ? "h-28" : "h-48"
        )}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); draw(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) draw(e); }}
      />
      <div className={cn("flex gap-2", compact && "flex-col sm:flex-row")}>
        <Button type="button" variant="outline" onClick={clear}>Clear</Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Capture signature"}
        </Button>
        {onSkip && (
          <Button type="button" variant="ghost" onClick={onSkip}>Skip for now</Button>
        )}
      </div>
    </div>
  );
}
