"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PublicDoc = {
  title: string;
  kind: string;
  body: string;
  signerName: string;
  signerEmail: string;
  status: string;
  businessName: string;
  signed: boolean;
};

export function PublicEsignView({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PublicDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"DRAW" | "TYPE">("DRAW");
  const [typed, setTyped] = useState("");
  const [signerName, setSignerName] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/public/esign/${token}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "This signing link is not valid");
        return body as PublicDoc;
      })
      .then((data) => {
        setDoc(data);
        setSignerName(data.signerName);
        setTyped(data.signerName);
        setDone(data.signed);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unavailable"))
      .finally(() => setLoading(false));
  }, [token]);

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || done) return;
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!doc) return;
    const signatureData = mode === "TYPE" ? typed.trim() : canvasRef.current?.toDataURL("image/png") ?? "";
    if (mode === "DRAW" && !hasInk) {
      setError("Draw your signature");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/esign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureKind: mode, signatureData, signerName }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not save signature");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save signature");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="p-10 text-center text-slate-500">Loading…</main>;
  if (!doc) return <main className="p-10 text-center text-red-600">{error ?? "Not found"}</main>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{doc.businessName}</p>
      <h1 className="mt-2 text-2xl font-semibold">{doc.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{doc.kind.replaceAll("_", " ")}</p>
      <article className="mt-6 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-800">
        {doc.body || "No additional terms."}
      </article>
      {done ? (
        <p className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          This document is signed. Thank you.
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <label className="text-sm font-medium">
            Your name
            <Input className="mt-1" required value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="button" variant={mode === "DRAW" ? "default" : "outline"} onClick={() => setMode("DRAW")}>
              Draw
            </Button>
            <Button type="button" variant={mode === "TYPE" ? "default" : "outline"} onClick={() => setMode("TYPE")}>
              Type to sign
            </Button>
          </div>
          {mode === "TYPE" ? (
            <label className="text-sm font-medium">
              Typed signature
              <Input className="mt-1 font-serif text-xl italic" required value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
          ) : (
            <canvas
              ref={canvasRef}
              width={560}
              height={160}
              className="h-40 w-full touch-none rounded-lg border border-slate-300 bg-slate-50"
              onPointerDown={draw}
              onPointerMove={(event) => event.buttons === 1 && draw(event)}
            />
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing…" : "Sign document"}
          </Button>
        </form>
      )}
    </main>
  );
}
