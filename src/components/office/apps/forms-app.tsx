"use client";

import { FormEvent, useMemo, useState } from "react";
import { ClipboardList, Eye, GripVertical, Inbox, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OfficeSuiteModule } from "@/lib/office/suite";
import type { OfficeWorkspaceRecordSummary } from "@/lib/office/workspace-service";
import { OfficeAppHeader } from "./app-header";
import { createWorkspaceRecord, recordMetadata, updateWorkspaceRecord, type OfficeAppPermissions } from "./record-client";

type FieldType = "text" | "email" | "number" | "textarea" | "select" | "checkbox";
type FormField = { id: string; label: string; type: FieldType; required: boolean; options: string[] };
type FormData = { kind: "form"; description: string; fields: FormField[] };
type ResponseData = { kind: "response"; formId: string; formTitle: string; answers: Record<string, string | boolean> };
const emptyForm: FormData = { kind: "form", description: "", fields: [{ id: crypto.randomUUID(), label: "Name", type: "text", required: true, options: [] }] };

/** Keep trailing commas/empty segments while typing so "a," does not collapse back to "a". */
function parseOptionsInput(value: string): string[] {
  return value.split(",").map((part, index, parts) => (index === parts.length - 1 ? part.replace(/^\s+/, "") : part.trim()));
}

function formatOptionsInput(options: string[]): string {
  return options.join(", ");
}

function finalizedOptions(options: string[]): string[] {
  return options.map((option) => option.trim()).filter(Boolean);
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

export function FormsApp({ module, initialRecords, permissions }: { module: OfficeSuiteModule; initialRecords: OfficeWorkspaceRecordSummary[]; permissions: OfficeAppPermissions }) {
  const forms = initialRecords.filter((record) => record.metadata?.kind !== "response");
  const [records, setRecords] = useState(initialRecords);
  const [activeId, setActiveId] = useState(forms[0]?.id ?? "");
  const active = records.find((record) => record.id === activeId);
  const [title, setTitle] = useState(active?.title ?? "Untitled form");
  const [form, setForm] = useState<FormData>(recordMetadata(active, emptyForm));
  const [mode, setMode] = useState<"build" | "preview" | "responses">("build");
  const [busy, setBusy] = useState(false);
  const responses = useMemo(() => records.filter((record) => record.metadata?.kind === "response" && record.metadata?.formId === activeId), [records, activeId]);

  function load(record?: OfficeWorkspaceRecordSummary) {
    setActiveId(record?.id ?? "");
    setTitle(record?.title ?? "Untitled form");
    setForm(recordMetadata(record, emptyForm));
    setMode("build");
  }

  function patchField(id: string, patch: Partial<FormField>) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    }));
  }

  async function save() {
    if (!title.trim()) {
      toast.error("Add a form title");
      return undefined;
    }
    setBusy(true);
    const metadata: FormData = {
      ...form,
      fields: form.fields.map((field) => ({ ...field, options: finalizedOptions(field.options) })),
    };
    try {
      const saved = active
        ? await updateWorkspaceRecord(module.slug, active.id, { title, summary: form.description, metadata })
        : await createWorkspaceRecord(module.slug, { title, summary: form.description, metadata });
      setForm(metadata);
      setRecords((items) => (active ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items]));
      setActiveId(saved.id);
      toast.success("Form saved");
      return saved;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save form");
    } finally {
      setBusy(false);
    }
  }

  async function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    let formRecord = active;
    if (!formRecord) formRecord = await save();
    if (!formRecord) return;
    const raw = new FormData(formElement);
    const answers: Record<string, string | boolean> = {};
    form.fields.forEach((field) => {
      answers[field.id] = field.type === "checkbox" ? raw.get(field.id) === "on" : String(raw.get(field.id) ?? "");
    });
    try {
      const response = await createWorkspaceRecord(module.slug, {
        title: `Response · ${title}`,
        summary: `Submitted ${new Date().toLocaleString()}`,
        status: "NEEDS_REVIEW",
        metadata: { kind: "response", formId: formRecord.id, formTitle: title, answers } satisfies ResponseData,
      });
      setRecords((items) => [response, ...items]);
      formElement.reset();
      toast.success("Response submitted");
      setMode("responses");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit response");
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <OfficeAppHeader module={module}>
        <Button variant="outline" onClick={() => load()} disabled={!permissions.canCreate}>
          <Plus className="h-4 w-4" />
          New form
        </Button>
        <Button onClick={save} disabled={busy}>
          <Save className="h-4 w-4" />
          Save form
        </Button>
      </OfficeAppHeader>

      <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[250px_1fr]">
        <aside className="border-b border-fuchsia-100 bg-fuchsia-50 p-4 xl:border-b-0 xl:border-r">
          <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700">Your forms</p>
          <div className="mt-3 space-y-1">
            {records
              .filter((r) => r.metadata?.kind !== "response")
              .map((record) => (
                <button
                  key={record.id}
                  onClick={() => load(record)}
                  className={`w-full rounded-xl p-3 text-left text-sm ${record.id === activeId ? "bg-fuchsia-600 text-white" : "hover:bg-fuchsia-100"}`}
                >
                  <span className="block break-words font-semibold">{record.title}</span>
                  <span className={`mt-1 block text-xs ${record.id === activeId ? "text-fuchsia-100" : "text-slate-500"}`}>
                    {records.filter((r) => r.metadata?.formId === record.id).length} responses
                  </span>
                </button>
              ))}
            {!forms.length ? <p className="p-3 text-sm text-fuchsia-900/60">Create your first form.</p> : null}
          </div>
        </aside>

        <main className="min-w-0">
          <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:p-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full min-w-0 border-0 text-lg font-semibold shadow-none sm:max-w-md"
              aria-label="Form title"
            />
            <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:ml-auto sm:w-auto">
              {(
                [
                  { id: "build", label: "Build", icon: ClipboardList },
                  { id: "preview", label: "Preview", icon: Eye },
                  { id: "responses", label: `Responses (${responses.length})`, icon: Inbox },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${mode === id ? "bg-white shadow-sm" : "text-slate-500"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "build" ? (
            <div className="mx-auto max-w-3xl p-4 sm:p-8">
              <label className="block text-sm font-medium">
                Description
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                  className="mt-1 min-h-20"
                  placeholder="Tell people what this form is for."
                />
              </label>

              <div className="mt-6 space-y-4">
                {form.fields.map((field, index) => (
                  <div key={field.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                        <GripVertical className="h-4 w-4 text-slate-300" aria-hidden />
                        <span>Question {index + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            fields: current.fields.filter((item) => item.id !== field.id),
                          }))
                        }
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete question ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <label className="mt-3 block text-xs font-medium text-slate-500">
                      Question
                      <Textarea
                        value={field.label}
                        onChange={(e) => patchField(field.id, { label: e.target.value })}
                        className="mt-1 min-h-[3rem] resize-y text-base leading-snug"
                        rows={2}
                        placeholder="Type the full question"
                        aria-label={`Question ${index + 1}`}
                      />
                    </label>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="block min-w-0 flex-1 text-xs font-medium text-slate-500">
                        Answer type
                        <select
                          value={field.type}
                          onChange={(e) => patchField(field.id, { type: e.target.value as FieldType })}
                          className="mt-1 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                          aria-label={`Answer type for question ${index + 1}`}
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex h-11 items-center gap-2 text-sm text-slate-600 sm:px-1">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => patchField(field.id, { required: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Required
                      </label>
                    </div>

                    {field.type === "select" ? (
                      <label className="mt-3 block text-xs font-medium text-slate-500">
                        Dropdown options
                        <Input
                          value={formatOptionsInput(field.options)}
                          onChange={(e) => patchField(field.id, { options: parseOptionsInput(e.target.value) })}
                          className="mt-1"
                          placeholder="Options separated by commas"
                          aria-label={`${field.label || "Dropdown"} options`}
                        />
                      </label>
                    ) : null}
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="mt-4 w-full sm:w-auto"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    fields: [...current.fields, { id: crypto.randomUUID(), label: "New question", type: "text", required: false, options: [] }],
                  }))
                }
              >
                <Plus className="h-4 w-4" />
                Add field
              </Button>
            </div>
          ) : null}

          {mode === "preview" ? (
            <form onSubmit={submitResponse} className="mx-auto max-w-2xl p-4 sm:p-10">
              <div className="rounded-2xl border-t-8 border-fuchsia-600 bg-white p-5 shadow-lg sm:p-6">
                <h2 className="text-2xl font-semibold break-words">{title}</h2>
                <p className="mt-2 text-sm break-words text-slate-600">{form.description}</p>
                <div className="mt-7 space-y-5">
                  {form.fields.map((field) => (
                    <label key={field.id} className="block text-sm font-medium break-words">
                      {field.label}
                      {field.required ? <span className="text-red-500"> *</span> : null}
                      {field.type === "textarea" ? (
                        <Textarea name={field.id} required={field.required} className="mt-1.5" />
                      ) : field.type === "select" ? (
                        <select name={field.id} required={field.required} className="mt-1.5 h-11 w-full rounded-md border px-3">
                          <option value="">Choose…</option>
                          {finalizedOptions(field.options).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <input name={field.id} type="checkbox" required={field.required} className="ml-3" />
                      ) : (
                        <Input name={field.id} type={field.type} required={field.required} className="mt-1.5" />
                      )}
                    </label>
                  ))}
                </div>
                <Button type="submit" className="mt-7 w-full bg-fuchsia-600 hover:bg-fuchsia-700 sm:w-auto">
                  Submit response
                </Button>
              </div>
            </form>
          ) : null}

          {mode === "responses" ? (
            <div className="p-4 sm:p-8">
              <h2 className="text-xl font-semibold">Submitted responses</h2>
              <div className="mt-4 space-y-3">
                {responses.map((response, index) => {
                  const data = recordMetadata<ResponseData>(response, { kind: "response", formId: "", formTitle: "", answers: {} });
                  return (
                    <details key={response.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <summary className="cursor-pointer font-medium">
                        Response {responses.length - index}{" "}
                        <span className="ml-2 text-xs font-normal text-slate-500">{new Date(response.createdAt).toLocaleString()}</span>
                      </summary>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        {form.fields.map((field) => (
                          <div key={field.id} className="rounded-lg bg-slate-50 p-3">
                            <dt className="text-xs font-medium break-words text-slate-500">{field.label}</dt>
                            <dd className="mt-1 text-sm break-words text-slate-900">{String(data.answers[field.id] ?? "—")}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  );
                })}
                {!responses.length ? (
                  <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
                    No responses yet. Use Preview to submit a test response.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
