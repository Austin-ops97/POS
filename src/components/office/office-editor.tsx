"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  FileClock,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  LockKeyhole,
  Printer,
  Save,
  Strikethrough,
  Table2,
  CopyPlus,
  Trash2,
  Underline,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfficeDocumentDetail, OfficeFolderSummary } from "./types";

type Props = {
  document: OfficeDocumentDetail;
  folders: OfficeFolderSummary[];
  tags: Array<{ id: string; name: string; color: string }>;
  capabilities: { canEdit: boolean; canDelete: boolean; canManageTemplates: boolean; canViewSensitive: boolean; canApprove: boolean };
};

async function apiMessage(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Unable to save the document";
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onMouseDown={(event) => { event.preventDefault(); onClick(); }} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950" aria-label={label} title={label}>{children}</button>;
}

export function OfficeEditor({ document, folders, tags, capabilities }: Props) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(document.content);
  const titleRef = useRef(document.title);
  const [title, setTitle] = useState(document.title);
  const [status, setStatus] = useState(document.status);
  const [folderId, setFolderId] = useState(document.folderId ?? "");
  const [selectedTags, setSelectedTags] = useState(document.tags.map((item) => item.tag.id));
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [showHistory, setShowHistory] = useState(false);
  const editable = capabilities.canEdit && (document.kind !== "TEMPLATE" || capabilities.canManageTemplates);

  const save = useCallback(async (silent = false) => {
    if (!editable) return true;
    setSaveState("saving");
    const response = await fetch(`/api/office/documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleRef.current.trim() || "Untitled document",
        content: contentRef.current,
        folderId: folderId || null,
        tagIds: selectedTags,
      }),
    });
    if (!response.ok) {
      setSaveState("error");
      if (!silent) toast.error(await apiMessage(response));
      return false;
    }
    setSaveState("saved");
    if (!silent) toast.success("Document saved");
    router.refresh();
    return true;
  }, [document.id, editable, folderId, router, selectedTags]);

  useEffect(() => {
    if (!dirtyRevision || !editable) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => void save(true), 1200);
    return () => window.clearTimeout(timer);
  }, [dirtyRevision, editable, save]);

  function markDirty() { setDirtyRevision((value) => value + 1); }
  function command(name: string, value?: string) { window.document.execCommand(name, false, value); editorRef.current?.focus(); contentRef.current = editorRef.current?.innerHTML ?? ""; markDirty(); }

  function insertLink() {
    const url = window.prompt("Link URL", "https://");
    if (url) command("createLink", url);
  }

  function insertTable() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const table = window.document.createElement("table");
    table.innerHTML = "<tbody><tr><th>Heading</th><th>Heading</th></tr><tr><td>Cell</td><td>Cell</td></tr></tbody>";
    table.className = "office-table";
    const range = selection.getRangeAt(0); range.deleteContents(); range.insertNode(table); range.setStartAfter(table); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
    contentRef.current = editorRef.current?.innerHTML ?? ""; markDirty();
  }

  async function updateStatus(next: typeof status) {
    if (!editable) return;
    if (!(await save(true))) return;
    const response = await fetch(`/api/office/documents/${document.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (!response.ok) return toast.error(await apiMessage(response));
    setStatus(next); toast.success(next === "PUBLISHED" ? "Document published" : next === "ARCHIVED" ? "Document archived" : "Moved to draft"); router.refresh();
  }

  async function createVersion() {
    if (!(await save(true))) return;
    const note = window.prompt("Optional note for this version") ?? undefined;
    const response = await fetch(`/api/office/documents/${document.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note || undefined }) });
    if (!response.ok) return toast.error(await apiMessage(response));
    toast.success("Version snapshot created"); router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete “${title}”?`)) return;
    const response = await fetch(`/api/office/documents/${document.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error(await apiMessage(response));
    toast.success("Document deleted"); router.push("/office"); router.refresh();
  }

  async function createFromTemplate() {
    const requested = window.prompt("Title for the new document", title.replace(/\s+template$/i, ""));
    if (!requested?.trim()) return;
    const response = await fetch("/api/office/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: requested.trim(),
        kind: "RICH_TEXT",
        content: contentRef.current,
        folderId: folderId || null,
        description: `Created from template: ${title}`,
      }),
    });
    if (!response.ok) return toast.error(await apiMessage(response));
    const created = await response.json();
    toast.success("Document created from template");
    router.push(`/office/documents/${created.id}`);
    router.refresh();
  }

  const statusText = saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : saveState === "error" ? "Save failed" : "All changes saved";

  return (
    <div className="office-editor-shell -m-4 min-h-full bg-slate-100 sm:-m-6 lg:-m-8">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-16 items-center gap-2 px-3 sm:px-5">
          <Button asChild variant="ghost" size="icon"><Link href="/office" aria-label="Back to Office"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="min-w-0 flex-1"><input value={title} disabled={!editable} onChange={(event) => { setTitle(event.target.value); titleRef.current = event.target.value; markDirty(); }} className="w-full truncate bg-transparent text-base font-semibold text-slate-950 outline-none disabled:opacity-100" aria-label="Document title" /><div className="flex items-center gap-1.5 text-[11px] text-slate-400">{saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : saveState === "saved" ? <Check className="h-3 w-3" /> : null}<span className={cn(saveState === "error" && "text-red-600")}>{statusText}</span>{document.isSensitive ? <><span>·</span><LockKeyhole className="h-3 w-3 text-amber-600" /><span>Sensitive</span></> : null}</div></div>
          <div className="hidden items-center gap-2 sm:flex"><select value={folderId} disabled={!editable} onChange={(event) => { setFolderId(event.target.value); markDirty(); }} className="h-9 max-w-40 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>{document.kind === "TEMPLATE" ? <Button variant="outline" size="sm" onClick={() => void createFromTemplate()}><CopyPlus className="h-4 w-4" />Use template</Button> : null}<Button variant="outline" size="sm" onClick={() => setShowHistory((value) => !value)}><FileClock className="h-4 w-4" />History</Button><Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>{editable ? <Button size="sm" onClick={() => void save(false)}><Save className="h-4 w-4" />Save</Button> : null}</div>
        </div>
        {editable ? <div className="flex items-center gap-0.5 overflow-x-auto border-t border-slate-100 px-3 py-1.5 sm:px-16"><select defaultValue="p" onChange={(event) => command("formatBlock", event.target.value)} className="mr-1 h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option></select><ToolButton label="Bold" onClick={() => command("bold")}><Bold className="h-4 w-4" /></ToolButton><ToolButton label="Italic" onClick={() => command("italic")}><Italic className="h-4 w-4" /></ToolButton><ToolButton label="Underline" onClick={() => command("underline")}><Underline className="h-4 w-4" /></ToolButton><ToolButton label="Strikethrough" onClick={() => command("strikeThrough")}><Strikethrough className="h-4 w-4" /></ToolButton><span className="mx-1 h-5 w-px bg-slate-200" /><ToolButton label="Bullet list" onClick={() => command("insertUnorderedList")}><List className="h-4 w-4" /></ToolButton><ToolButton label="Numbered list" onClick={() => command("insertOrderedList")}><ListOrdered className="h-4 w-4" /></ToolButton><ToolButton label="Align left" onClick={() => command("justifyLeft")}><AlignLeft className="h-4 w-4" /></ToolButton><ToolButton label="Align center" onClick={() => command("justifyCenter")}><AlignCenter className="h-4 w-4" /></ToolButton><ToolButton label="Align right" onClick={() => command("justifyRight")}><AlignRight className="h-4 w-4" /></ToolButton><ToolButton label="Insert link" onClick={insertLink}><Link2 className="h-4 w-4" /></ToolButton><ToolButton label="Insert table" onClick={insertTable}><Table2 className="h-4 w-4" /></ToolButton><input type="color" aria-label="Text color" className="ml-1 h-7 w-7 cursor-pointer rounded border-0 bg-transparent" onChange={(event) => command("foreColor", event.target.value)} /></div> : null}
      </header>

      <div className="mx-auto flex max-w-[90rem] gap-5 p-3 sm:p-6">
        <main className="min-w-0 flex-1">
          <div className="office-paper mx-auto min-h-[70vh] w-full max-w-[52rem] bg-white px-[clamp(1.5rem,7vw,5rem)] py-[clamp(2rem,7vw,5rem)] shadow-sm ring-1 ring-slate-200 print:max-w-none print:shadow-none print:ring-0">
            <div ref={editorRef} contentEditable={editable} suppressContentEditableWarning onInput={(event) => { contentRef.current = event.currentTarget.innerHTML; markDirty(); }} dangerouslySetInnerHTML={{ __html: document.content }} className={cn("office-rich-text min-h-[55vh] outline-none", !editable && "cursor-default")} data-placeholder="Start writing…" />
          </div>
        </main>

        {showHistory ? <aside className="hidden w-72 shrink-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 xl:block"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Version history</h2><button onClick={() => setShowHistory(false)}><ChevronDown className="h-4 w-4 -rotate-90 text-slate-400" /></button></div>{editable ? <Button variant="outline" size="sm" className="w-full" onClick={() => void createVersion()}><FileClock className="h-4 w-4" />Create snapshot</Button> : null}<div className="space-y-2">{document.versions.map((version) => <div key={version.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">Version {version.version}</span><span className="text-[10px] text-slate-400">{new Date(version.createdAt).toLocaleDateString()}</span></div><p className="mt-1 text-xs text-slate-500">{version.note || `Saved by ${version.author.name}`}</p></div>)}</div></aside> : null}
      </div>

      <div className="fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg print:hidden"><div className="hidden max-w-44 flex-wrap gap-1 px-1 lg:flex">{tags.slice(0, 6).map((tag) => <button key={tag.id} disabled={!editable} onClick={() => { setSelectedTags((items) => items.includes(tag.id) ? items.filter((id) => id !== tag.id) : [...items, tag.id]); markDirty(); }} className={cn("rounded-full border px-2 py-1 text-[10px]", selectedTags.includes(tag.id) ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 text-slate-500")}>{tag.name}</button>)}</div><select value={status} disabled={!editable} onChange={(event) => void updateStatus(event.target.value as typeof status)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs capitalize"><option value="DRAFT">Draft</option><option value="PUBLISHED" disabled={!capabilities.canApprove && status !== "PUBLISHED"}>Published</option><option value="ARCHIVED">Archived</option></select>{capabilities.canDelete ? <Button variant="ghost" size="icon" onClick={() => void remove()} className="text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button> : null}</div>
    </div>
  );
}
