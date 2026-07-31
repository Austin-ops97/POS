"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MonitorPlay, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { OfficeAppHeader } from "./app-header";
import { createWorkspaceRecord, recordMetadata, updateWorkspaceRecord, type OfficeAppPermissions } from "./record-client";

type Slide = { id: string; title: string; body: string; notes: string; theme: "midnight" | "sand" | "ocean" };
type DeckData = { slides: Slide[] };
const newSlide = (): Slide => ({ id: crypto.randomUUID(), title: "New slide", body: "Add the important details here.", notes: "", theme: "midnight" });

export function PresentationApp({ module, initialRecords, permissions }: { module: OfficeSuiteModule; initialRecords: OfficeWorkspaceRecordSummary[]; permissions: OfficeAppPermissions }) {
  const [records, setRecords] = useState(initialRecords);
  const [activeId, setActiveId] = useState(initialRecords[0]?.id ?? "");
  const first = initialRecords[0];
  const [title, setTitle] = useState(first?.title ?? "Untitled presentation");
  const [slides, setSlides] = useState<Slide[]>(recordMetadata<DeckData>(first, { slides: [newSlide()] }).slides);
  const [slideIndex, setSlideIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [saving, setSaving] = useState(false);
  const slide = slides[slideIndex] ?? slides[0];

  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresenting(false);
      if (event.key === "ArrowRight") setSlideIndex((i) => Math.min(slides.length - 1, i + 1));
      if (event.key === "ArrowLeft") setSlideIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, slides.length]);

  function load(record?: OfficeWorkspaceRecordSummary) {
    setActiveId(record?.id ?? ""); setTitle(record?.title ?? "Untitled presentation");
    setSlides(recordMetadata<DeckData>(record, { slides: [newSlide()] }).slides); setSlideIndex(0);
  }
  function patchSlide(values: Partial<Slide>) { setSlides((items) => items.map((item, i) => i === slideIndex ? { ...item, ...values } : item)); }
  async function save() {
    setSaving(true);
    try {
      const active = records.find((record) => record.id === activeId);
      const saved = active ? await updateWorkspaceRecord(module.slug, active.id, { title, metadata: { slides } }) : await createWorkspaceRecord(module.slug, { title, summary: `${slides.length} slide deck`, metadata: { slides } });
      setRecords((items) => active ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]); setActiveId(saved.id); toast.success("Presentation saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save presentation"); } finally { setSaving(false); }
  }
  const theme = slide?.theme === "sand" ? "bg-amber-50 text-amber-950" : slide?.theme === "ocean" ? "bg-cyan-950 text-white" : "bg-slate-950 text-white";
  return <div className="space-y-5 pb-8">
    <OfficeAppHeader module={module}>
      <Button variant="outline" onClick={() => load()} disabled={!permissions.canCreate}><Plus className="h-4 w-4" />New deck</Button>
      <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</Button>
      <Button variant="outline" onClick={() => setPresenting(true)}><MonitorPlay className="h-4 w-4" />Present</Button>
      <Button onClick={save} disabled={saving || (!activeId && !permissions.canCreate) || (!!activeId && !permissions.canEdit)}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}</Button>
    </OfficeAppHeader>
    <div className="grid min-h-[660px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-xl xl:grid-cols-[260px_1fr_300px]">
      <aside className="border-b border-white/10 bg-slate-950 p-4 text-white xl:border-b-0 xl:border-r">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-white/10 bg-white/10 text-white" aria-label="Presentation title" />
        <select value={activeId} onChange={(e) => load(records.find((record) => record.id === e.target.value))} className="mt-3 h-10 w-full rounded-lg border border-white/10 bg-white/10 px-3 text-sm" aria-label="Open saved presentation"><option value="">Current unsaved deck</option>{records.map((record) => <option key={record.id} value={record.id} className="text-slate-900">{record.title}</option>)}</select>
        <div className="mt-4 space-y-3">{slides.map((item, index) => <button key={item.id} onClick={() => setSlideIndex(index)} className={`w-full rounded-xl border p-2 text-left ${index === slideIndex ? "border-orange-400 bg-orange-400/10" : "border-white/10 hover:border-white/30"}`}><span className="mb-1 block text-[10px] text-slate-400">{index + 1}</span><span className={`flex aspect-video items-center justify-center rounded-lg p-2 text-center text-xs ${item.theme === "sand" ? "bg-amber-50 text-amber-950" : item.theme === "ocean" ? "bg-cyan-950" : "bg-slate-800"}`}>{item.title}</span></button>)}</div>
        <Button variant="outline" className="mt-3 w-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={() => { setSlides((items) => [...items, newSlide()]); setSlideIndex(slides.length); }}><Plus className="h-4 w-4" />Add slide</Button>
      </aside>
      <main className="flex items-center justify-center bg-slate-800 p-5 sm:p-10">
        <div className={`flex aspect-video w-full max-w-4xl flex-col justify-center rounded-sm p-[8%] shadow-2xl ${theme}`}>
          <input value={slide?.title ?? ""} onChange={(e) => patchSlide({ title: e.target.value })} className="w-full border-0 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:opacity-50 sm:text-5xl" placeholder="Slide title" />
          <textarea value={slide?.body ?? ""} onChange={(e) => patchSlide({ body: e.target.value })} className="mt-5 min-h-24 w-full resize-none border-0 bg-transparent text-lg leading-relaxed opacity-80 outline-none sm:text-2xl" placeholder="Supporting message" />
        </div>
      </main>
      <aside className="border-t border-white/10 bg-white p-5 xl:border-l xl:border-t-0">
        <h2 className="font-semibold text-slate-900">Slide settings</h2>
        <label className="mt-5 block text-xs font-semibold text-slate-600">Theme</label>
        <div className="mt-2 grid grid-cols-3 gap-2">{(["midnight", "sand", "ocean"] as const).map((item) => <button key={item} onClick={() => patchSlide({ theme: item })} className={`rounded-lg border px-2 py-2 text-xs capitalize ${slide?.theme === item ? "border-orange-500 ring-2 ring-orange-100" : "border-slate-200"}`}>{item}</button>)}</div>
        <label className="mt-5 block text-xs font-semibold text-slate-600">Speaker notes</label>
        <Textarea value={slide?.notes ?? ""} onChange={(e) => patchSlide({ notes: e.target.value })} className="mt-2 min-h-40" placeholder="Private notes for the presenter…" />
        <Button variant="ghost" className="mt-5 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={slides.length === 1} onClick={() => { setSlides((items) => items.filter((_, i) => i !== slideIndex)); setSlideIndex((i) => Math.max(0, i - 1)); }}><Trash2 className="h-4 w-4" />Delete slide</Button>
      </aside>
    </div>
    {presenting ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black p-4" role="dialog" aria-modal="true" aria-label="Presentation mode"><button className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white" onClick={() => setPresenting(false)} aria-label="Exit presentation"><X /></button><button className="absolute left-4 rounded-full bg-white/10 p-3 text-white disabled:opacity-20" disabled={slideIndex === 0} onClick={() => setSlideIndex((i) => i - 1)} aria-label="Previous slide"><ChevronLeft /></button><div className={`flex aspect-video w-[88vw] max-w-6xl flex-col justify-center p-[8%] ${theme}`}><h2 className="text-5xl font-semibold sm:text-7xl">{slide.title}</h2><p className="mt-8 whitespace-pre-wrap text-2xl leading-relaxed opacity-80 sm:text-4xl">{slide.body}</p></div><button className="absolute right-4 rounded-full bg-white/10 p-3 text-white disabled:opacity-20" disabled={slideIndex === slides.length - 1} onClick={() => setSlideIndex((i) => i + 1)} aria-label="Next slide"><ChevronRight /></button><span className="absolute bottom-4 text-sm text-white/60">{slideIndex + 1} / {slides.length}</span></div> : null}
  </div>;
}
