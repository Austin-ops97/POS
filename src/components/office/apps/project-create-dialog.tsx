"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildProjectRecordInput } from "@/lib/office/project-create";
import type { ProjectCustomerOption } from "@/lib/office/project-form-options";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { createWorkspaceRecord, type EmployeeOption } from "./record-client";

export function ProjectCreateDialog({
  open,
  onOpenChange,
  customers,
  employees,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: ProjectCustomerOption[];
  employees: EmployeeOption[];
  onCreated: (record: OfficeWorkspaceRecordSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const built = buildProjectRecordInput({
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      customerId: String(form.get("customerId") || ""),
      startsAt: String(form.get("startsAt") || ""),
      dueAt: String(form.get("dueAt") || ""),
      priority: String(form.get("priority") || "NORMAL"),
      assignedToId: String(form.get("assignedToId") || ""),
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      const saved = await createWorkspaceRecord("projects", built.input);
      onOpenChange(false);
      onCreated(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Name the project, choose a customer, and set the dates. It opens on the project board after you create it.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 grid gap-4">
            <div>
              <Label htmlFor="project-name">Project name</Label>
              <Input id="project-name" name="title" required maxLength={160} className="mt-1" autoFocus />
            </div>
            <div>
              <Label htmlFor="project-customer">Customer</Label>
              <select
                id="project-customer"
                name="customerId"
                className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                defaultValue=""
              >
                <option value="">No customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
              {customers.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">No customers yet. You can still create the project.</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="project-start">Start date</Label>
                <Input id="project-start" name="startsAt" type="date" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="project-due">Due date</Label>
                <Input id="project-due" name="dueAt" type="date" className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="project-description">Description</Label>
              <Textarea id="project-description" name="description" maxLength={2000} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="project-priority">Priority</Label>
                <select
                  id="project-priority"
                  name="priority"
                  defaultValue="NORMAL"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>
              <div>
                <Label htmlFor="project-owner">Owner</Label>
                <select
                  id="project-owner"
                  name="assignedToId"
                  defaultValue=""
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Unassigned</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
