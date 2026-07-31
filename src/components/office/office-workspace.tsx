"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Camera,
  File,
  FileText,
  Folder,
  FolderPlus,
  Grid2X2,
  List,
  LockKeyhole,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OfficeDocumentSummary, OfficeFolderSummary } from "./types";

type Props = {
  initialDocuments: OfficeDocumentSummary[];
  folders: OfficeFolderSummary[];
  permissions: { canCreate: boolean; canScan: boolean; canManageFolders: boolean; canDelete: boolean };
};

const kindLabels = { RICH_TEXT: "Document", SCAN: "Scan", UPLOAD: "File", TEMPLATE: "Template" };

async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "The request failed";
}

export function OfficeWorkspace({ initialDocuments, folders: initialFolders, permissions }: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [folders, setFolders] = useState(initialFolders);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return documents.filter((document) => {
      if (folderId && document.folder?.id !== folderId) return false;
      if (favoritesOnly && !document.isFavorite) return false;
      return !normalized || `${document.title} ${document.description ?? ""} ${document.tags.map((t) => t.tag.name).join(" ")}`.toLowerCase().includes(normalized);
    });
  }, [documents, favoritesOnly, folderId, query]);

  async function toggleFavorite(document: OfficeDocumentSummary) {
    const next = !document.isFavorite;
    setDocuments((items) => items.map((item) => (item.id === document.id ? { ...item, isFavorite: next } : item)));
    const response = await fetch(`/api/office/documents/${document.id}/favorite`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    });
    if (!response.ok) {
      setDocuments((items) => items.map((item) => (item.id === document.id ? { ...item, isFavorite: !next } : item)));
      toast.error(await responseError(response));
    }
  }

  async function removeDocument(document: OfficeDocumentSummary) {
    if (!window.confirm(`Move “${document.title}” to deleted documents?`)) return;
    const response = await fetch(`/api/office/documents/${document.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error(await responseError(response));
    setDocuments((items) => items.filter((item) => item.id !== document.id));
    toast.success("Document deleted");
  }

  async function createFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    const response = await fetch("/api/office/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color: "#64748b" }),
    });
    if (!response.ok) return toast.error(await responseError(response));
    const folder = await response.json();
    setFolders((items) => [...items, { ...folder, _count: { documents: 0 } }]);
    toast.success("Folder created");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Office</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">Create, scan, organize, and securely retain business records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissions.canScan ? (
            <Button asChild variant="outline" className="rounded-xl"><Link href="/office/scan"><Camera className="h-4 w-4" />Scan document</Link></Button>
          ) : null}
          {permissions.canCreate ? (
            <Button asChild className="rounded-xl"><Link href="/office/new"><Plus className="h-4 w-4" />New document</Link></Button>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "All documents", value: documents.length, icon: FileText },
          { label: "Drafts", value: documents.filter((d) => d.status === "DRAFT").length, icon: File },
          { label: "Published", value: documents.filter((d) => d.status === "PUBLISHED").length, icon: FileText },
          { label: "Archived", value: documents.filter((d) => d.status === "ARCHIVED").length, icon: Archive },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-slate-200 shadow-none"><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-slate-100 p-2.5"><Icon className="h-5 w-5 text-slate-700" /></div><div><p className="text-2xl font-bold text-slate-950">{value}</p><p className="text-xs text-slate-500">{label}</p></div></CardContent></Card>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="space-y-1 rounded-2xl border border-slate-200 bg-white p-3">
          <button onClick={() => { setFolderId(null); setFavoritesOnly(false); }} className={cn("flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm", !folderId && !favoritesOnly ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}><FileText className="h-4 w-4" />All documents</button>
          <button onClick={() => { setFolderId(null); setFavoritesOnly(true); }} className={cn("flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm", favoritesOnly ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}><Star className="h-4 w-4" />Favorites</button>
          <div className="flex items-center justify-between px-3 pb-1 pt-4"><span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Folders</span>{permissions.canManageFolders ? <button onClick={() => void createFolder()} aria-label="Create folder"><FolderPlus className="h-4 w-4 text-slate-500" /></button> : null}</div>
          {folders.map((folder) => <button key={folder.id} onClick={() => { setFolderId(folder.id); setFavoritesOnly(false); }} className={cn("flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm", folderId === folder.id ? "bg-slate-100 font-semibold text-slate-950" : "text-slate-600 hover:bg-slate-100")}><Folder className="h-4 w-4" style={{ color: folder.color }} /><span className="min-w-0 flex-1 truncate text-left">{folder.name}</span><span className="text-xs text-slate-400">{folder._count.documents}</span></button>)}
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, descriptions, and tags" className="h-11 rounded-xl bg-white pl-10" /></div>
            <div className="flex rounded-xl border border-slate-200 bg-white p-1"><button onClick={() => setView("grid")} className={cn("rounded-lg p-2", view === "grid" && "bg-slate-100")} aria-label="Grid view"><Grid2X2 className="h-4 w-4" /></button><button onClick={() => setView("list")} className={cn("rounded-lg p-2", view === "list" && "bg-slate-100")} aria-label="List view"><List className="h-4 w-4" /></button></div>
          </div>

          {visible.length ? (
            <div className={cn(view === "grid" ? "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" : "space-y-2")}>
              {visible.map((document) => (
                <article key={document.id} className={cn("group relative rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md", view === "list" ? "flex items-center gap-3 p-3" : "p-4")}>
                  <Link href={`/office/documents/${document.id}`} className={cn("min-w-0 flex-1", view === "grid" && "block pr-14")}>
                    <div className="flex items-center gap-2"><div className="rounded-xl bg-slate-100 p-2"><FileText className="h-5 w-5 text-slate-700" /></div><div className="min-w-0"><h2 className="truncate font-semibold text-slate-950">{document.title}</h2><p className="text-xs text-slate-500">{kindLabels[document.kind]} · {document.updatedBy.name}</p></div></div>
                    {view === "grid" ? <><p className="mt-4 line-clamp-2 min-h-10 text-sm text-slate-500">{document.description || (document.kind === "SCAN" ? `${document.files.length} scanned page${document.files.length === 1 ? "" : "s"}` : "No description")}</p><div className="mt-4 flex items-center justify-between"><div className="flex items-center gap-1.5">{document.isSensitive ? <LockKeyhole className="h-3.5 w-3.5 text-amber-600" /> : null}<Badge variant="secondary" className="text-[10px]">{document.status.toLowerCase()}</Badge></div><span className="text-xs text-slate-400">{formatDistanceToNow(new Date(document.updatedAt), { addSuffix: true })}</span></div></> : <span className="mt-1 block text-xs text-slate-400">Updated {formatDistanceToNow(new Date(document.updatedAt), { addSuffix: true })}</span>}
                  </Link>
                  <div className={cn("flex gap-1", view === "grid" ? "absolute right-3 top-3" : "ml-auto")}><button onClick={() => void toggleFavorite(document)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-amber-500" aria-label={document.isFavorite ? "Remove favorite" : "Add favorite"}><Star className={cn("h-4 w-4", document.isFavorite && "fill-amber-400 text-amber-400")} /></button>{permissions.canDelete ? <button onClick={() => void removeDocument(document)} className="rounded-lg p-2 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label="Delete document"><Trash2 className="h-4 w-4" /></button> : null}</div>
                </article>
              ))}
            </div>
          ) : <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><FileText className="h-10 w-10 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-800">No matching documents</h2><p className="mt-1 text-sm text-slate-500">Create a document or adjust your search and folder filter.</p></div>}
        </section>
      </div>
    </div>
  );
}
