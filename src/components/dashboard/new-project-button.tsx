"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    if (!title) return;
    setBusy(true);
    try {
      const response = await fetch("/api/office/workspaces/projects/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          summary: String(form.get("summary") || ""),
          dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : null,
          status: "ACTIVE",
          priority: "NORMAL",
          metadata: { tasks: [], color: "amber" },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? "Could not create the project");
        return;
      }
      toast.success("Project created");
      setOpen(false);
      router.push("/office/apps/projects");
      router.refresh();
    } catch {
      toast.error("Could not create the project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FolderKanban className="h-4 w-4" />
        New Project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <form id="new-project" className="space-y-3" onSubmit={(event) => void create(event)}>
            <div>
              <Label htmlFor="project-title">Name</Label>
              <Input id="project-title" name="title" required maxLength={180} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="project-summary">Summary</Label>
              <Input id="project-summary" name="summary" maxLength={500} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="project-due">Due date</Label>
              <Input id="project-due" name="dueAt" type="date" className="mt-1.5" />
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="new-project" disabled={busy}>
              {busy ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
