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
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-900">Completion photos</h3>
        </div>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {projectStatus.replaceAll("_", " ")}
        </span>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          {canEditPhotos ? (
            <div className="mt-4 flex flex-wrap gap-2">
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
              <Button type="button" variant="outline" disabled={busy} onClick={() => cameraRef.current?.click()}>
                <Camera className="h-4 w-4" />
                Take photo
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
                Upload
              </Button>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {attachments.map((photo) => (
              <figure key={photo.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.storageUrl} alt={photo.originalFilename} className="aspect-square w-full object-cover" />
                {canEditPhotos && !photo.submissionId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeAttachment(photo.id)}
                    className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-red-600 shadow"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </figure>
            ))}
            {!attachments.length ? (
              <p className="col-span-full rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Add completion photos before submitting.
              </p>
            ) : null}
          </div>

          {canEditPhotos ? (
            <form onSubmit={submit} className="mt-5 space-y-3 border-t border-slate-100 pt-5">
              <label className="block text-sm font-medium">
                Completion note
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1"
                  placeholder="Anything the reviewer should know"
                />
              </label>
              <Button type="submit" disabled={busy || (pendingPhotos.length === 0 && attachments.length === 0)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Submit for approval
              </Button>
            </form>
          ) : null}

          {canReopen && ["COMPLETE", "APPROVED", "REJECTED"].includes(projectStatus) ? (
            <div className="mt-4">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void reopen()}>
                <RotateCcw className="h-4 w-4" />
                Reopen project
              </Button>
            </div>
          ) : null}

          {submissions.length ? (
            <div className="mt-6 space-y-2 border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Submission history</p>
              {submissions.map((submission) => (
                <div key={submission.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{submission.status.replaceAll("_", " ")}</span>
                    <span className="text-xs text-slate-500">{new Date(submission.submittedAt).toLocaleString()}</span>
                  </div>
                  {submission.completionNote ? <p className="mt-1 text-slate-600">{submission.completionNote}</p> : null}
                  {submission.reviewComment ? (
                    <p className="mt-1 text-slate-600">Review: {submission.reviewComment}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
