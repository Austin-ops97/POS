"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FileClock,
  FileDown,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  LockKeyhole,
  Minus,
  MoreHorizontal,
  Paintbrush,
  Pilcrow,
  Printer,
  Redo2,
  Replace,
  RotateCcw,
  Save,
  Search,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OfficeDocumentDetail, OfficeFolderSummary } from "./types";

type Props = {
  document: OfficeDocumentDetail;
  folders: OfficeFolderSummary[];
  tags: Array<{ id: string; name: string; color: string }>;
  capabilities: {
    canEdit: boolean;
    canDelete: boolean;
    canManageTemplates: boolean;
    canViewSensitive: boolean;
    canApprove: boolean;
  };
};

type SaveState = "saved" | "saving" | "unsaved" | "error";
type RibbonTab = "Home" | "Insert" | "Layout" | "Review" | "View";
type PageSize = "letter" | "legal" | "a4";
type Orientation = "portrait" | "landscape";
type MarginSize = "normal" | "narrow" | "wide";

const RIBBON_TABS: RibbonTab[] = ["Home", "Insert", "Layout", "Review", "View"];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const FONT_FAMILIES = [
  ["Arial", "Arial, sans-serif"],
  ["Calibri", "Calibri, Arial, sans-serif"],
  ["Georgia", "Georgia, serif"],
  ["Times New Roman", "'Times New Roman', serif"],
  ["Verdana", "Verdana, sans-serif"],
] as const;

function apiMessage(response: Response) {
  return response
    .json()
    .catch(() => null)
    .then((body) => body?.error ?? "Unable to save the document");
}

function countDocument(text: string) {
  const normalized = text.replace(/\u00a0/g, " ").trim();
  return {
    words: normalized ? normalized.split(/\s+/u).length : 0,
    characters: text.length,
    charactersWithoutSpaces: text.replace(/\s/gu, "").length,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function ToolButton({
  label,
  onClick,
  active = false,
  disabled = false,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={cn(
        "flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-40",
        active && "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
        className
      )}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
    >
      {children}
    </button>
  );
}

function RibbonGroup({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex shrink-0 flex-col border-r border-slate-200 px-2 last:border-r-0", className)}>
      <div className="flex min-h-12 flex-1 items-center gap-0.5">{children}</div>
      <span className="pb-0.5 text-center text-[9px] font-medium uppercase tracking-[0.08em] text-slate-400">{label}</span>
    </div>
  );
}

function ToolbarSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value)}
      className={cn("h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-400", className)}
    >
      {children}
    </select>
  );
}

export function OfficeEditor({ document, folders, tags, capabilities }: Props) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef(document.content);
  const titleRef = useRef(document.title);
  const folderIdRef = useRef(document.folderId ?? "");
  const selectedTagsRef = useRef(document.tags.map((item) => item.tag.id));
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const statsTimerRef = useRef<number | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const saveRef = useRef<(silent?: boolean) => Promise<boolean>>(async () => true);
  const serverUpdatedAt = useRef(new Date(document.updatedAt).getTime());

  const [title, setTitle] = useState(document.title);
  const [status, setStatus] = useState(document.status);
  const [folderId, setFolderId] = useState(document.folderId ?? "");
  const [selectedTags, setSelectedTags] = useState(document.tags.map((item) => item.tag.id));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<RibbonTab>("Home");
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findIndex, setFindIndex] = useState(-1);
  const [findCount, setFindCount] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [findRevision, setFindRevision] = useState(0);
  const [fontFamily, setFontFamily] = useState("Calibri, Arial, sans-serif");
  const [fontSize, setFontSize] = useState("11");
  const [lineSpacing, setLineSpacing] = useState("1.15");
  const [blockStyle, setBlockStyle] = useState("p");
  const [formatState, setFormatState] = useState({ bold: false, italic: false, underline: false, strike: false });
  const [zoom, setZoom] = useState(100);
  const [pageSize, setPageSize] = useState<PageSize>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [margins, setMargins] = useState<MarginSize>("normal");
  const [showMarks, setShowMarks] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [stats, setStats] = useState(() => countDocument(""));

  const editable = capabilities.canEdit && (document.kind !== "TEMPLATE" || capabilities.canManageTemplates);
  const recoveryKey = `nexapos:office:draft:${document.id}`;
  const layoutKey = `nexapos:office:layout:${document.id}`;

  const pageDimensions = useMemo(() => {
    const sizes = {
      letter: { width: 8.5, height: 11 },
      legal: { width: 8.5, height: 14 },
      a4: { width: 8.27, height: 11.69 },
    };
    const base = sizes[pageSize];
    return orientation === "portrait" ? base : { width: base.height, height: base.width };
  }, [orientation, pageSize]);

  const marginInches = margins === "narrow" ? 0.5 : margins === "wide" ? 1.5 : 1;

  useLayoutEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = document.content || "<p><br></p>";
    contentRef.current = document.content || "<p><br></p>";
    setStats(countDocument(editorRef.current?.innerText ?? ""));

    try {
      const layout = JSON.parse(window.localStorage.getItem(layoutKey) ?? "null");
      if (layout?.pageSize === "letter" || layout?.pageSize === "legal" || layout?.pageSize === "a4") setPageSize(layout.pageSize);
      if (layout?.orientation === "portrait" || layout?.orientation === "landscape") setOrientation(layout.orientation);
      if (layout?.margins === "normal" || layout?.margins === "narrow" || layout?.margins === "wide") setMargins(layout.margins);
      if (typeof layout?.zoom === "number") setZoom(Math.min(200, Math.max(50, layout.zoom)));

      const recovery = JSON.parse(window.localStorage.getItem(recoveryKey) ?? "null");
      if (recovery?.content && recovery.updatedAt > serverUpdatedAt.current && recovery.content !== document.content) {
        setRecoveryAvailable(true);
      }
    } catch {
      // A malformed browser cache must never prevent the server document from opening.
    }
  }, [document.content, document.id, layoutKey, recoveryKey]);

  useEffect(() => {
    window.localStorage.setItem(layoutKey, JSON.stringify({ pageSize, orientation, margins, zoom }));
  }, [layoutKey, margins, orientation, pageSize, zoom]);

  const save = useCallback(async (silent = false) => {
    if (!editable) return true;

    if (saveInFlightRef.current) {
      const succeeded = await saveInFlightRef.current;
      if (succeeded && !silent) toast.success("Document saved");
      return succeeded;
    }

    const operation = (async () => {
      while (savedRevisionRef.current < revisionRef.current) {
        const revision = revisionRef.current;
        const payload = {
          title: titleRef.current.trim() || "Untitled document",
          content: contentRef.current,
          folderId: folderIdRef.current || null,
          tagIds: selectedTagsRef.current,
        };

        setSaveState("saving");
        try {
          const response = await fetch(`/api/office/documents/${document.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            savedRevisionRef.current = revision;
            serverUpdatedAt.current = Date.now();
            continue;
          }
          setSaveState("error");
          if (!silent) toast.error(await apiMessage(response));
          return false;
        } catch {
          setSaveState("error");
          if (!silent) toast.error("Unable to reach the server. Your work is saved on this device.");
          return false;
        }
      }
      return true;
    })();

    saveInFlightRef.current = operation;
    const succeeded = await operation;
    if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
    if (succeeded) {
      setSaveState("saved");
      window.localStorage.removeItem(recoveryKey);
      setRecoveryAvailable(false);
      if (!silent) toast.success("Document saved");
    }
    return succeeded;
  }, [document.id, editable, recoveryKey]);

  saveRef.current = save;

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setSaveState((current) => (current === "unsaved" ? current : "unsaved"));

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => void saveRef.current(true), 1200);

    if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = window.setTimeout(() => {
      window.localStorage.setItem(recoveryKey, JSON.stringify({
        title: titleRef.current,
        content: contentRef.current,
        updatedAt: Date.now(),
      }));
    }, 250);

    if (statsTimerRef.current) window.clearTimeout(statsTimerRef.current);
    statsTimerRef.current = window.setTimeout(() => {
      setStats(countDocument(editorRef.current?.innerText ?? ""));
      setFindRevision((value) => value + 1);
    }, 180);
  }, [recoveryKey]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (revisionRef.current <= savedRevisionRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      if (recoveryTimerRef.current) window.clearTimeout(recoveryTimerRef.current);
      if (statsTimerRef.current) window.clearTimeout(statsTimerRef.current);
    };
  }, []);

  const captureSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();

    setFormatState({
      bold: window.document.queryCommandState("bold"),
      italic: window.document.queryCommandState("italic"),
      underline: window.document.queryCommandState("underline"),
      strike: window.document.queryCommandState("strikeThrough"),
    });
  }, []);

  useEffect(() => {
    window.document.addEventListener("selectionchange", captureSelection);
    return () => window.document.removeEventListener("selectionchange", captureSelection);
  }, [captureSelection]);

  function restoreSelection() {
    const selection = window.getSelection();
    if (!selection || !savedRangeRef.current) return;
    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
  }

  function command(name: string, value?: string) {
    restoreSelection();
    window.document.execCommand("styleWithCSS", false, "true");
    window.document.execCommand(name, false, value);
    editorRef.current?.focus();
    contentRef.current = editorRef.current?.innerHTML ?? "";
    captureSelection();
    markDirty();
  }

  function insertHtml(html: string) {
    restoreSelection();
    editorRef.current?.focus();
    window.document.execCommand("insertHTML", false, html);
    contentRef.current = editorRef.current?.innerHTML ?? "";
    markDirty();
  }

  function applyLineSpacing(value: string) {
    restoreSelection();
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    const blocks = Array.from(editor.querySelectorAll<HTMLElement>("p,h1,h2,h3,blockquote,li")).filter((element) => {
      try {
        return range.intersectsNode(element);
      } catch {
        return false;
      }
    });
    if (!blocks.length) {
      const start = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer as HTMLElement
        : range.startContainer.parentElement;
      const block = start?.closest<HTMLElement>("p,h1,h2,h3,blockquote,li");
      if (block && editor.contains(block)) blocks.push(block);
    }
    blocks.forEach((block) => { block.style.lineHeight = value; });
    contentRef.current = editor.innerHTML;
    editor.focus();
    markDirty();
  }

  function insertLink() {
    restoreSelection();
    const url = window.prompt("Enter a web or email address", "https://");
    if (!url) return;
    const safeUrl = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    const selection = window.getSelection();
    if (selection?.isCollapsed) insertHtml(`<a href="${safeUrl}" target="_blank">${safeUrl}</a>`);
    else command("createLink", safeUrl);
  }

  function insertTable() {
    const rows = Math.min(20, Math.max(1, Number(window.prompt("Number of rows", "3")) || 0));
    if (!rows) return;
    const columns = Math.min(10, Math.max(1, Number(window.prompt("Number of columns", "3")) || 0));
    if (!columns) return;
    const body = Array.from({ length: rows }, (_, row) =>
      `<tr>${Array.from({ length: columns }, (_, column) =>
        row === 0 ? `<th>Heading ${column + 1}</th>` : "<td><br></td>"
      ).join("")}</tr>`
    ).join("");
    insertHtml(`<table><tbody>${body}</tbody></table><p><br></p>`);
  }

  function insertPageBreak() {
    insertHtml('<div class="office-page-break" data-office-page-break="true"><span>Page break</span></div><p><br></p>');
  }

  async function insertImage(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Choose a PNG, JPEG, WebP, HEIC, or HEIF image");
    setUploadingImage(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`/api/office/documents/${document.id}/files`, { method: "POST", body: form });
      if (!response.ok) return toast.error(await apiMessage(response));
      const uploaded = await response.json();
      const alt = file.name.replace(/\.[^.]+$/, "");
      insertHtml(`<figure><img src="/api/office/files/${uploaded.id}" alt="${escapeHtml(alt)}"><figcaption>${escapeHtml(alt)}</figcaption></figure><p><br></p>`);
      toast.success("Image inserted");
    } catch {
      toast.error("Unable to upload the image");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function getFindRanges() {
    const root = editorRef.current;
    const query = findText;
    if (!root || !query) return [];
    const ranges: Range[] = [];
    const walker = window.document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest(".office-page-break") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    let node = walker.nextNode();
    while (node) {
      const raw = node.textContent ?? "";
      const haystack = caseSensitive ? raw : raw.toLocaleLowerCase();
      let offset = 0;
      while ((offset = haystack.indexOf(needle, offset)) !== -1) {
        const before = raw[offset - 1] ?? "";
        const after = raw[offset + query.length] ?? "";
        const isWhole = !wholeWord || (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after));
        if (isWhole) {
          const range = window.document.createRange();
          range.setStart(node, offset);
          range.setEnd(node, offset + query.length);
          ranges.push(range);
        }
        offset += Math.max(query.length, 1);
      }
      node = walker.nextNode();
    }
    return ranges;
  }

  useEffect(() => {
    const ranges = getFindRanges();
    setFindCount(ranges.length);
    setFindIndex((current) => (ranges.length ? Math.min(Math.max(current, 0), ranges.length - 1) : -1));
    // findRevision intentionally refreshes matches after edits without touching the editor DOM.
    void findRevision;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseSensitive, findRevision, findText, wholeWord]);

  function goToMatch(direction: 1 | -1) {
    const ranges = getFindRanges();
    if (!ranges.length) return;
    const next = findIndex < 0 ? 0 : (findIndex + direction + ranges.length) % ranges.length;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(ranges[next]);
    savedRangeRef.current = ranges[next].cloneRange();
    ranges[next].startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFindIndex(next);
  }

  function replaceCurrent() {
    const ranges = getFindRanges();
    if (!ranges.length) return;
    const index = findIndex < 0 ? 0 : Math.min(findIndex, ranges.length - 1);
    ranges[index].deleteContents();
    ranges[index].insertNode(window.document.createTextNode(replaceText));
    contentRef.current = editorRef.current?.innerHTML ?? "";
    markDirty();
    setFindRevision((value) => value + 1);
  }

  function replaceAll() {
    const ranges = getFindRanges();
    if (!ranges.length) return;
    [...ranges].reverse().forEach((range) => {
      range.deleteContents();
      range.insertNode(window.document.createTextNode(replaceText));
    });
    contentRef.current = editorRef.current?.innerHTML ?? "";
    markDirty();
    setFindRevision((value) => value + 1);
    toast.success(`Replaced ${ranges.length} ${ranges.length === 1 ? "match" : "matches"}`);
  }

  function restoreRecovery() {
    try {
      const recovery = JSON.parse(window.localStorage.getItem(recoveryKey) ?? "null");
      if (!recovery?.content || !editorRef.current) return;
      editorRef.current.innerHTML = recovery.content;
      contentRef.current = recovery.content;
      if (recovery.title) {
        setTitle(recovery.title);
        titleRef.current = recovery.title;
      }
      setRecoveryAvailable(false);
      markDirty();
      toast.success("Recovered the unsaved draft from this device");
    } catch {
      toast.error("The local recovery copy could not be read");
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void save(false);
      } else if (key === "f") {
        event.preventDefault();
        setShowFind(true);
      } else if (key === "k" && editable) {
        event.preventDefault();
        insertLink();
      } else if (event.key === "Enter" && editable) {
        event.preventDefault();
        insertPageBreak();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // insertLink and insertPageBreak intentionally use the latest saved selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, save]);

  async function updateStatus(next: typeof status) {
    if (!editable || !(await save(true))) return;
    const response = await fetch(`/api/office/documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!response.ok) return toast.error(await apiMessage(response));
    setStatus(next);
    toast.success(next === "PUBLISHED" ? "Document published" : next === "ARCHIVED" ? "Document archived" : "Moved to draft");
    router.refresh();
  }

  async function createVersion() {
    if (!(await save(true))) return;
    const note = window.prompt("Optional note for this version") ?? undefined;
    const response = await fetch(`/api/office/documents/${document.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note || undefined }),
    });
    if (!response.ok) return toast.error(await apiMessage(response));
    toast.success("Version snapshot created");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete “${title}”?`)) return;
    const response = await fetch(`/api/office/documents/${document.id}`, { method: "DELETE" });
    if (!response.ok) return toast.error(await apiMessage(response));
    toast.success("Document deleted");
    router.push("/office");
    router.refresh();
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

  function duplicateDocument() {
    const requested = window.prompt("Name the duplicate", `${title} copy`);
    if (!requested?.trim()) return;
    void (async () => {
      const response = await fetch("/api/office/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: requested.trim(), kind: "RICH_TEXT", content: contentRef.current, folderId: folderId || null }),
      });
      if (!response.ok) return toast.error(await apiMessage(response));
      const created = await response.json();
      router.push(`/office/documents/${created.id}`);
    })();
  }

  const statusText = saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : saveState === "error" ? "Save failed — local copy retained" : "All changes saved";
  const estimatedPages = Math.max(1, Math.ceil((editorRef.current?.scrollHeight ?? 1) / (pageDimensions.height * 96 - marginInches * 192)));

  return (
    <div className="office-editor-shell page-flush min-h-[calc(100dvh-4rem)] bg-[#eef1f5]">
      <header className="sticky top-0 z-30 border-b border-slate-300 bg-white shadow-sm print:hidden">
        <div className="flex min-h-14 items-center gap-2 px-2 sm:px-4">
          <Button asChild variant="ghost" size="icon"><Link href="/office" aria-label="Back to Office"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              disabled={!editable}
              onChange={(event) => {
                setTitle(event.target.value);
                titleRef.current = event.target.value;
                markDirty();
              }}
              className="w-full truncate bg-transparent text-[15px] font-semibold text-slate-950 outline-none disabled:opacity-100"
              aria-label="Document title"
            />
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : saveState === "saved" ? <Check className="h-3 w-3" /> : null}
              <span className={cn(saveState === "error" && "text-red-600")}>{statusText}</span>
              {document.isSensitive ? <><span>·</span><LockKeyhole className="h-3 w-3 text-amber-600" /><span>Sensitive</span></> : null}
            </div>
          </div>
          <div className="hidden items-center gap-1.5 md:flex">
            <select value={folderId} disabled={!editable} onChange={(event) => {
              const value = event.target.value;
              setFolderId(value);
              folderIdRef.current = value;
              markDirty();
            }} className="h-9 max-w-40 rounded-lg border border-slate-200 bg-white px-2 text-xs">
              <option value="">No folder</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            {document.kind === "TEMPLATE" ? <Button variant="outline" size="sm" onClick={() => void createFromTemplate()}><CopyPlus className="h-4 w-4" />Use template</Button> : null}
            <Button variant="ghost" size="icon" onClick={() => setShowFind((value) => !value)} aria-label="Find and replace"><Search className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => setShowHistory((value) => !value)} aria-label="Version history"><FileClock className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label="Print"><Printer className="h-4 w-4" /></Button>
            {editable ? <Button size="sm" onClick={() => void save(false)}><Save className="h-4 w-4" />Save</Button> : null}
          </div>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveTab((tab) => tab === "Home" ? "Insert" : "Home")} aria-label="More editor tools"><MoreHorizontal className="h-5 w-5" /></Button>
        </div>

        {editable ? <>
          <div className="flex items-end gap-0 overflow-x-auto border-t border-slate-100 px-2 sm:px-4">
            {RIBBON_TABS.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={cn("relative min-h-9 px-3 text-xs font-medium text-slate-600 hover:text-slate-950", activeTab === tab && "text-blue-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-blue-600")}>{tab}</button>)}
          </div>
          <div className="flex min-h-[4.75rem] items-stretch overflow-x-auto border-t border-slate-100 bg-[#fbfcfd] px-1 py-1">
            {activeTab === "Home" ? <>
              <RibbonGroup label="History">
                <ToolButton label="Undo" onClick={() => command("undo")}><Undo2 className="h-4 w-4" /></ToolButton>
                <ToolButton label="Redo" onClick={() => command("redo")}><Redo2 className="h-4 w-4" /></ToolButton>
              </RibbonGroup>
              <RibbonGroup label="Font" className="min-w-[16rem]">
                <div className="grid grid-cols-[1fr_4.5rem] gap-1">
                  <ToolbarSelect label="Font family" value={fontFamily} onChange={(value) => { setFontFamily(value); command("fontName", value); }}>
                    {FONT_FAMILIES.map(([label, value]) => <option key={label} value={value}>{label}</option>)}
                  </ToolbarSelect>
                  <ToolbarSelect label="Font size" value={fontSize} onChange={(value) => { setFontSize(value); command("fontSize", `${value}px`); }}>
                    {FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                  </ToolbarSelect>
                  <div className="col-span-2 flex gap-0.5">
                    <ToolButton label="Bold (Ctrl+B)" active={formatState.bold} onClick={() => command("bold")}><Bold className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Italic (Ctrl+I)" active={formatState.italic} onClick={() => command("italic")}><Italic className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Underline (Ctrl+U)" active={formatState.underline} onClick={() => command("underline")}><Underline className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Strikethrough" active={formatState.strike} onClick={() => command("strikeThrough")}><Strikethrough className="h-4 w-4" /></ToolButton>
                    <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-slate-100" title="Text color"><span className="h-4 w-4 rounded-sm border-2 border-slate-500" /><input type="color" aria-label="Text color" className="absolute inset-0 opacity-0" onChange={(event) => command("foreColor", event.target.value)} /></label>
                    <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-slate-100" title="Highlight color"><Highlighter className="h-4 w-4" /><input type="color" aria-label="Highlight color" defaultValue="#fff59d" className="absolute inset-0 opacity-0" onChange={(event) => command("hiliteColor", event.target.value)} /></label>
                    <ToolButton label="Clear formatting (Ctrl+Space)" onClick={() => command("removeFormat")}><Paintbrush className="h-4 w-4" /></ToolButton>
                  </div>
                </div>
              </RibbonGroup>
              <RibbonGroup label="Paragraph">
                <div className="grid grid-cols-6 gap-0.5">
                  <ToolButton label="Bullets" onClick={() => command("insertUnorderedList")}><List className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Numbering" onClick={() => command("insertOrderedList")}><ListOrdered className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Checklist" onClick={() => insertHtml('<ul class="office-checklist"><li>Checklist item</li></ul>')}><ListChecks className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Decrease indent" onClick={() => command("outdent")}><IndentDecrease className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Increase indent" onClick={() => command("indent")}><IndentIncrease className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Show formatting marks" active={showMarks} onClick={() => setShowMarks((value) => !value)}><Pilcrow className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Align left" onClick={() => command("justifyLeft")}><AlignLeft className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Align center" onClick={() => command("justifyCenter")}><AlignCenter className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Align right" onClick={() => command("justifyRight")}><AlignRight className="h-4 w-4" /></ToolButton>
                  <ToolButton label="Justify" onClick={() => command("justifyFull")}><AlignJustify className="h-4 w-4" /></ToolButton>
                  <ToolbarSelect label="Line spacing" value={lineSpacing} onChange={(value) => { setLineSpacing(value); applyLineSpacing(value); }} className="col-span-2 w-[5.5rem]">
                    <option value="1">1.0 lines</option><option value="1.15">1.15 lines</option><option value="1.5">1.5 lines</option><option value="2">2.0 lines</option>
                  </ToolbarSelect>
                </div>
              </RibbonGroup>
              <RibbonGroup label="Styles">
                <ToolbarSelect label="Text style" value={blockStyle} onChange={(value) => { setBlockStyle(value); command("formatBlock", value); }} className="w-32">
                  <option value="p">Normal</option><option value="h1">Title</option><option value="h2">Heading 1</option><option value="h3">Heading 2</option><option value="blockquote">Quote</option>
                </ToolbarSelect>
              </RibbonGroup>
              <RibbonGroup label="Editing">
                <ToolButton label="Find and replace (Ctrl+F)" onClick={() => setShowFind(true)}><Search className="h-4 w-4" /></ToolButton>
              </RibbonGroup>
            </> : null}

            {activeTab === "Insert" ? <>
              <RibbonGroup label="Pages">
                <ToolButton label="Insert page break (Ctrl+Enter)" onClick={insertPageBreak}><FileDown className="h-5 w-5" /></ToolButton>
              </RibbonGroup>
              <RibbonGroup label="Tables">
                <ToolButton label="Insert table" onClick={insertTable}><Table2 className="h-5 w-5" /></ToolButton>
              </RibbonGroup>
              <RibbonGroup label="Media">
                <ToolButton label="Insert image" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()}>{uploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}</ToolButton>
                <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void insertImage(file); }} />
              </RibbonGroup>
              <RibbonGroup label="Links">
                <ToolButton label="Insert hyperlink (Ctrl+K)" onClick={insertLink}><Link2 className="h-5 w-5" /></ToolButton>
              </RibbonGroup>
              <RibbonGroup label="Elements">
                <ToolButton label="Horizontal line" onClick={() => insertHtml("<hr><p><br></p>")}><Minus className="h-5 w-5" /></ToolButton>
                <ToolButton label="Date and time" onClick={() => insertHtml(`<time datetime="${new Date().toISOString()}">${new Date().toLocaleString()}</time>`)}><FileClock className="h-5 w-5" /></ToolButton>
                <ToolButton label="Symbol" onClick={() => { const symbol = window.prompt("Enter a symbol", "©"); if (symbol) insertHtml(symbol.replace(/[<>]/g, "")); }}><span className="text-lg">Ω</span></ToolButton>
              </RibbonGroup>
            </> : null}

            {activeTab === "Layout" ? <>
              <RibbonGroup label="Page setup">
                <ToolbarSelect label="Paper size" value={pageSize} onChange={(value) => setPageSize(value as PageSize)} className="w-28"><option value="letter">Letter 8.5 × 11</option><option value="legal">Legal 8.5 × 14</option><option value="a4">A4</option></ToolbarSelect>
                <ToolbarSelect label="Orientation" value={orientation} onChange={(value) => setOrientation(value as Orientation)} className="w-24"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></ToolbarSelect>
                <ToolbarSelect label="Margins" value={margins} onChange={(value) => setMargins(value as MarginSize)} className="w-24"><option value="normal">Normal</option><option value="narrow">Narrow</option><option value="wide">Wide</option></ToolbarSelect>
              </RibbonGroup>
              <RibbonGroup label="Breaks"><ToolButton label="Insert page break" onClick={insertPageBreak}><FileDown className="h-5 w-5" /></ToolButton></RibbonGroup>
              <RibbonGroup label="Paragraph">
                <ToolButton label="Decrease indent" onClick={() => command("outdent")}><IndentDecrease className="h-5 w-5" /></ToolButton>
                <ToolButton label="Increase indent" onClick={() => command("indent")}><IndentIncrease className="h-5 w-5" /></ToolButton>
              </RibbonGroup>
            </> : null}

            {activeTab === "Review" ? <>
              <RibbonGroup label="Proofing">
                <ToolButton label="Find" onClick={() => setShowFind(true)}><Search className="h-5 w-5" /></ToolButton>
                <div className="px-2 text-xs text-slate-500"><div className="font-semibold text-slate-700">Browser spellcheck</div><div>Enabled for this document</div></div>
              </RibbonGroup>
              <RibbonGroup label="History">
                <ToolButton label="Create version snapshot" onClick={() => void createVersion()}><FileClock className="h-5 w-5" /></ToolButton>
                <ToolButton label="View version history" onClick={() => setShowHistory(true)}><RotateCcw className="h-5 w-5" /></ToolButton>
              </RibbonGroup>
            </> : null}

            {activeTab === "View" ? <>
              <RibbonGroup label="Zoom">
                <ToolButton label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))}><ZoomOut className="h-5 w-5" /></ToolButton>
                <button type="button" onClick={() => setZoom(100)} className="min-w-14 text-xs font-semibold text-slate-700">{zoom}%</button>
                <ToolButton label="Zoom in" onClick={() => setZoom((value) => Math.min(200, value + 10))}><ZoomIn className="h-5 w-5" /></ToolButton>
              </RibbonGroup>
              <RibbonGroup label="Display"><ToolButton label="Show formatting marks" active={showMarks} onClick={() => setShowMarks((value) => !value)}><Pilcrow className="h-5 w-5" /></ToolButton></RibbonGroup>
            </> : null}
          </div>
        </> : null}
      </header>

      {recoveryAvailable ? <div className="sticky top-[10.5rem] z-20 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 print:hidden"><span>An unsaved local copy from this device is newer than the server version.</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { window.localStorage.removeItem(recoveryKey); setRecoveryAvailable(false); }}>Discard</Button><Button size="sm" onClick={restoreRecovery}>Recover</Button></div></div> : null}

      {showFind ? <div className="fixed right-3 top-36 z-40 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl print:hidden">
        <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Search className="h-4 w-4" />Find and replace</div><button type="button" onClick={() => setShowFind(false)} className="rounded p-1 hover:bg-slate-100" aria-label="Close find"><X className="h-4 w-4" /></button></div>
        <div className="flex gap-1"><input autoFocus value={findText} onChange={(event) => { setFindText(event.target.value); setFindIndex(-1); }} onKeyDown={(event) => { if (event.key === "Enter") goToMatch(event.shiftKey ? -1 : 1); }} placeholder="Find" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" /><ToolButton label="Previous result" onClick={() => goToMatch(-1)}><ChevronLeft className="h-4 w-4" /></ToolButton><ToolButton label="Next result" onClick={() => goToMatch(1)}><ChevronRight className="h-4 w-4" /></ToolButton></div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500"><span>{findText ? `${findCount ? findIndex + 1 : 0} of ${findCount}` : "Enter text to search"}</span><div className="flex gap-2"><label className="flex items-center gap-1"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} />Match case</label><label className="flex items-center gap-1"><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} />Whole word</label></div></div>
        <div className="mt-2 flex gap-1"><input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replace with" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" /><Button variant="outline" size="sm" onClick={replaceCurrent} disabled={!findCount}><Replace className="h-4 w-4" />Replace</Button><Button variant="outline" size="sm" onClick={replaceAll} disabled={!findCount}>All</Button></div>
      </div> : null}

      <div className="mx-auto flex max-w-[100rem] gap-5 px-3 py-5 sm:px-6">
        <main className="min-w-0 flex-1 overflow-auto pb-14">
          <div className="office-page-frame mx-auto origin-top transition-[width] duration-150" style={{ width: `${pageDimensions.width * 96 * zoom / 100}px`, maxWidth: "none" }}>
            <div
              className="office-paper mx-auto bg-white text-slate-950 shadow-[0_2px_12px_rgba(15,23,42,0.16)] ring-1 ring-slate-300"
              style={{
                "--office-page-margin": `${marginInches}in`,
                minHeight: `${pageDimensions.height * 96}px`,
                width: `${pageDimensions.width * 96}px`,
                padding: `${marginInches * 96}px`,
                transform: `scale(${zoom / 100})`,
                transformOrigin: "top left",
              } as React.CSSProperties}
              data-page-size={pageSize}
              data-orientation={orientation}
            >
              <div
                ref={editorRef}
                contentEditable={editable}
                suppressContentEditableWarning
                spellCheck
                role="textbox"
                aria-label="Document body"
                aria-multiline="true"
                onFocus={captureSelection}
                onInput={(event) => {
                  contentRef.current = event.currentTarget.innerHTML;
                  markDirty();
                }}
                onPaste={() => window.setTimeout(() => {
                  contentRef.current = editorRef.current?.innerHTML ?? "";
                  markDirty();
                }, 0)}
                className={cn("office-rich-text min-h-[6in] outline-none", showMarks && "office-show-marks", !editable && "cursor-default")}
                data-placeholder="Start writing…"
              />
            </div>
          </div>
        </main>

        {showHistory ? <aside className="sticky top-48 hidden h-[calc(100dvh-14rem)] w-72 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:block print:hidden">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Version history</h2><button type="button" onClick={() => setShowHistory(false)} aria-label="Close version history"><X className="h-4 w-4 text-slate-400" /></button></div>
          {editable ? <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => void createVersion()}><FileClock className="h-4 w-4" />Create snapshot</Button> : null}
          <div className="mt-4 space-y-2">{document.versions.map((version) => <div key={version.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">Version {version.version}</span><span className="text-[10px] text-slate-400">{new Date(version.createdAt).toLocaleDateString()}</span></div><p className="mt-1 text-xs text-slate-500">{version.note || `Saved by ${version.author.name}`}</p></div>)}</div>
        </aside> : null}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 flex min-h-9 items-center justify-between border-t border-slate-300 bg-white px-3 text-[11px] text-slate-600 shadow-[0_-2px_8px_rgba(15,23,42,0.05)] print:hidden sm:px-5">
        <div className="flex items-center gap-3"><span>Page 1 of {estimatedPages}</span><span>{stats.words.toLocaleString()} words</span><span className="hidden sm:inline">{stats.characters.toLocaleString()} characters</span><span className="hidden lg:inline">English (US)</span></div>
        <div className="flex items-center gap-1"><button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} className="rounded p-1 hover:bg-slate-100" aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></button><input type="range" min="50" max="200" step="10" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Document zoom" className="w-20 accent-blue-600 sm:w-28" /><button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} className="rounded p-1 hover:bg-slate-100" aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setZoom(100)} className="w-10 text-right">{zoom}%</button></div>
      </footer>

      <div className="fixed bottom-12 right-3 z-20 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg print:hidden">
        <div className="hidden max-w-44 flex-wrap gap-1 px-1 2xl:flex">{tags.slice(0, 6).map((tag) => <button key={tag.id} disabled={!editable} onClick={() => {
          setSelectedTags((items) => {
            const next = items.includes(tag.id) ? items.filter((id) => id !== tag.id) : [...items, tag.id];
            selectedTagsRef.current = next;
            return next;
          });
          markDirty();
        }} className={cn("rounded-full border px-2 py-1 text-[10px]", selectedTags.includes(tag.id) ? "border-slate-700 bg-slate-800 text-white" : "border-slate-200 text-slate-500")}>{tag.name}</button>)}</div>
        <select value={status} disabled={!editable} onChange={(event) => void updateStatus(event.target.value as typeof status)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs capitalize"><option value="DRAFT">Draft</option><option value="PUBLISHED" disabled={!capabilities.canApprove && status !== "PUBLISHED"}>Published</option><option value="ARCHIVED">Archived</option></select>
        <div className="relative group"><Button variant="ghost" size="icon" aria-label="More document actions"><ChevronDown className="h-4 w-4" /></Button><div className="invisible absolute bottom-full right-0 mb-1 w-44 rounded-lg border border-slate-200 bg-white p-1 opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"><button type="button" onClick={duplicateDocument} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-slate-50"><CopyPlus className="h-4 w-4" />Duplicate</button><button type="button" onClick={() => window.print()} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-slate-50"><Printer className="h-4 w-4" />Print / Save PDF</button>{capabilities.canDelete ? <button type="button" onClick={() => void remove()} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />Move to trash</button> : null}</div></div>
      </div>
    </div>
  );
}
