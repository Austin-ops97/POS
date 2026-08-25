"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Attachment = {
  id: string;
  storageUrl: string;
  originalFilename: string;
  mimeType: string;
  caption: string | null;
  submissionId: string | null;
  createdAt: string;
};

type Submission = {
  id: string;
  status: string;
  completionNote: string | null;
  reviewComment: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

async function apiError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error ?? "Request failed";
}

export function ProjectCompletionPanel({
  projectId,
  projectStatus,
  canSubmit,
  canReopen,
  onStatusChange,
}: {
  projectId: string;
  projectStatus: string;
  canSubmit: boolean;
  canReopen: boolean;
  onStatusChange?: (status: string) => void;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/office/projects/${projectId}/attachments`),
        fetch(`/api/office/projects/${projectId}/submissions`),
      ]);
      if (!aRes.ok) throw new Error(await apiError(aRes));
      if (!sRes.ok) throw new Error(await apiError(sRes));
      setAttachments(await aRes.json());
      setSubmissions(await sRes.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load completion data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/office/projects/${projectId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(await apiError(res));
      }
      toast.success("Photo uploaded");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  async function removeAttachment(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/office/projects/${projectId}/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await apiError(res));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete photo");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/office/projects/${projectId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completionNote: note || null }),
      });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success("Submitted for approval");
      setNote("");
      onStatusChange?.("PENDING_APPROVAL");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      const res = await fetch(`/api/office/projects/${projectId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(await apiError(res));
      toast.success("Project reopened");
      onStatusChange?.("ACTIVE");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reopen");
    } finally {
      setBusy(false);
    }
  }

  const pendingPhotos = attachments.filter((a) => !a.submissionId);
  const canEditPhotos =
    canSubmit && ["ACTIVE", "CHANGES_REQUESTED", "REJECTED"].includes(projectStatus);

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-900">Completion photos</h3>
          <span className="truncate text-[11px] text-slate-400">{projectStatus.replaceAll("_", " ")}</span>
        </div>
        {canEditPhotos ? (
          <div className="flex shrink-0 gap-1">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void uploadFiles(e.target.files)}
            />
            <Button type="button" variant="ghost" size="sm" className="h-8 min-h-8 px-2 text-xs" disabled={busy} onClick={() => cameraRef.current?.click()}>
              <Camera className="h-3.5 w-3.5" />
              Photo
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 min-h-8 px-2 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-1.5 text-xs text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mt-1.5 flex min-h-10 items-center gap-1.5 overflow-x-auto">
            {attachments.map((photo) => (
              <figure key={photo.id} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.storageUrl} alt={photo.originalFilename} className="h-full w-full object-cover" />
                {canEditPhotos && !photo.submissionId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeAttachment(photo.id)}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 hover:bg-black/40 hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </figure>
            ))}
            {!attachments.length ? <p className="text-xs text-slate-400">No photos yet</p> : null}
          </div>

          {canEditPhotos ? (
            <form onSubmit={submit} className="mt-1.5 flex items-center gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-8 min-h-8"
                placeholder="Note for reviewer"
              />
              <Button type="submit" size="sm" className="h-8 min-h-8 shrink-0 px-2 text-xs" disabled={busy || (pendingPhotos.length === 0 && attachments.length === 0)}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Submit
              </Button>
            </form>
          ) : null}

          {canReopen && ["COMPLETE", "APPROVED", "REJECTED"].includes(projectStatus) ? (
            <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 min-h-8 px-2 text-xs" disabled={busy} onClick={() => void reopen()}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </Button>
          ) : null}

          {submissions.length ? (
            <p className="mt-1 truncate text-[11px] text-slate-400">
              Last: {submissions[0].status.replaceAll("_", " ")} · {new Date(submissions[0].submittedAt).toLocaleDateString()}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
