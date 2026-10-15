"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildProjectRecordInput } from "@/lib/office/project-create";
import type { ProjectCustomerOption } from "@/lib/office/project-form-options";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { createWorkspaceRecord, type EmployeeOption } from "./record-client";

const DATE_ERROR = "The due date can't be before the start date.";

export function ProjectCreateDialog({
  open,
  onOpenChange,
  employees,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeOption[];
  onCreated: (record: OfficeWorkspaceRecordSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [searchError, setSearchError] = useState<string>();
  const [customerId, setCustomerId] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [clientName, setClientName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectCustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [dueAt, setDueAt] = useState("");

  useEffect(() => {
    if (open) return;
    setBusy(false);
    setError(undefined);
    setSearchError(undefined);
    setCustomerId("");
    setSelectedName("");
    setClientName("");
    setQuery("");
    setResults([]);
    setSearching(false);
    setStartsAt("");
    setDueAt("");
  }, [open]);

  useEffect(() => {
    if (!open || customerId) return;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const response = await fetch(`/api/office/projects/customers?q=${encodeURIComponent(query)}`, {
            signal: controller.signal,
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) throw new Error(body?.error ?? "Could not search customers");
          setResults(Array.isArray(body?.customers) ? body.customers : []);
          setSearchError(undefined);
        } catch (err) {
          if (controller.signal.aborted) return;
          setResults([]);
          setSearchError(err instanceof Error ? err.message : "Could not search customers");
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [open, query, customerId]);

  function selectCustomer(customer: ProjectCustomerOption) {
    setCustomerId(customer.id);
    setSelectedName(customer.name);
    setClientName("");
    setQuery("");
    setResults([]);
    setError(undefined);
    setSearchError(undefined);
  }

  function clearCustomer() {
    setCustomerId("");
    setSelectedName("");
  }

  function changeStart(value: string) {
    setStartsAt(value);
    setError(value && dueAt && value > dueAt ? DATE_ERROR : undefined);
  }

  function changeDue(value: string) {
    setDueAt(value);
    setError(startsAt && value && startsAt > value ? DATE_ERROR : undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const built = buildProjectRecordInput({
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      customerId,
      clientName,
      startsAt,
      dueAt,
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
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              The project name is required. A customer is optional — search the directory, or type a client name if they are not in it.
            </DialogDescription>
          </DialogHeader>
          <div className="my-5 grid gap-4">
            <div>
              <Label htmlFor="project-name">Project name</Label>
              <Input id="project-name" name="title" required maxLength={160} className="mt-1" autoFocus />
            </div>
            <div>
              <Label htmlFor="project-customer-search">Customer</Label>
              {customerId ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{selectedName}</span>
                  <button type="button" className="shrink-0 text-xs font-medium text-slate-600 underline" onClick={clearCustomer}>
                    Clear
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    id="project-customer-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="mt-1"
                    placeholder="Search this business's customers"
                    role="combobox"
                    aria-expanded={results.length > 0}
                    aria-controls="project-customer-results"
                    aria-autocomplete="list"
                    autoComplete="off"
                  />
                  {searching ? <p className="mt-1 text-xs text-slate-500">Searching…</p> : null}
                  {results.length > 0 ? (
                    <ul
                      id="project-customer-results"
                      role="listbox"
                      className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white"
                    >
                      {results.map((customer) => (
                        <li key={customer.id} role="option" aria-selected={false}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => selectCustomer(customer)}
                          >
                            {customer.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : query.trim() && !searching ? (
                    <p className="mt-1 text-xs text-slate-500">No matching customers in this business.</p>
                  ) : null}
                </>
              )}
            </div>
            {customerId ? null : (
              <div>
                <Label htmlFor="project-client-name">Client name</Label>
                <Input
                  id="project-client-name"
                  value={clientName}
                  maxLength={120}
                  className="mt-1"
                  placeholder="Optional, if they are not in the directory"
                  onChange={(event) => setClientName(event.target.value)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="project-start">Start date</Label>
                <Input
                  id="project-start"
                  name="startsAt"
                  type="date"
                  value={startsAt}
                  max={dueAt || undefined}
                  onChange={(event) => changeStart(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="project-due">Due date</Label>
                <Input
                  id="project-due"
                  name="dueAt"
                  type="date"
                  value={dueAt}
                  min={startsAt || undefined}
                  onChange={(event) => changeDue(event.target.value)}
                  className="mt-1"
                />
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
            {searchError ? (
              <p className="text-sm text-red-600" role="alert">
                {searchError}
              </p>
            ) : null}
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
