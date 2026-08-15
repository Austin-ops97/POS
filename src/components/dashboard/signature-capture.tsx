"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignatureCapture({ orderId, signerName: initialSignerName }: { orderId: string; signerName?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signerName, setSignerName] = useState(initialSignerName ?? "");
  const [consentText, setConsentText] = useState("I acknowledge and approve this transaction.");
  const [saving, setSaving] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
      clear();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium"><Label>Signer name</Label><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} /></label>
        <label className="space-y-2 text-sm font-medium"><Label>Consent statement</Label><Input value={consentText} onChange={(e) => setConsentText(e.target.value)} /></label>
      </div>
      <canvas
        ref={canvasRef}
        width={900}
        height={240}
        className="h-48 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); draw(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) draw(e); }}
      />
      <div className="flex gap-2"><Button type="button" variant="outline" onClick={clear}>Clear</Button><Button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Capture signature"}</Button></div>
    </div>
  );
}
