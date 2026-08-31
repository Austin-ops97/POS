"use client";

import { FormEvent, useEffect, useState } from "react";
import { finalizedFormOptions, type FormField } from "@/lib/office/form-types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type PublicForm = {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
};

export function PublicFormView({ formId }: { formId: string }) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/forms/${formId}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "This form is not available");
        }
        return response.json() as Promise<PublicForm>;
      })
      .then((data) => {
        if (!cancelled) {
          setForm(data);
          setError(null);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : "This form is not available");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const formElement = event.currentTarget;
    const raw = new FormData(formElement);
    const answers: Record<string, string | boolean> = {};
    form.fields.forEach((field) => {
      answers[field.id] = field.type === "checkbox" ? raw.get(field.id) === "on" : String(raw.get(field.id) ?? "");
    });

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/forms/${formId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not submit your response");
      setSubmitted(true);
      formElement.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit your response");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {loading ? <p className="text-center text-sm text-slate-500">Loading form…</p> : null}
        {!loading && error && !form ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">Form unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
          </div>
        ) : null}
        {!loading && form && submitted ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">Thank you</h1>
            <p className="mt-2 text-sm text-slate-600">Your response to {form.title} was submitted successfully.</p>
          </div>
        ) : null}
        {!loading && form && !submitted ? (
          <form onSubmit={onSubmit} className="rounded-2xl border-t-8 border-fuchsia-600 bg-white p-6 shadow-lg sm:p-8">
            <h1 className="text-3xl font-semibold break-words text-slate-950">{form.title}</h1>
            {form.description ? <p className="mt-2 text-sm break-words text-slate-600">{form.description}</p> : null}
            {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-8 space-y-5">
              {form.fields.map((field) => (
                <label key={field.id} className="block text-sm font-medium break-words text-slate-800">
                  {field.label}
                  {field.required ? <span className="text-red-500"> *</span> : null}
                  {field.type === "textarea" ? (
                    <Textarea name={field.id} required={field.required} className="mt-1.5" />
                  ) : field.type === "select" ? (
                    <select name={field.id} required={field.required} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 px-3">
                      <option value="">Choose…</option>
                      {finalizedFormOptions(field.options).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <input name={field.id} type="checkbox" required={field.required} className="ml-3 h-4 w-4" />
                  ) : (
                    <Input name={field.id} type={field.type} required={field.required} className="mt-1.5" />
                  )}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={submitting} className="mt-8 w-full bg-fuchsia-600 hover:bg-fuchsia-700 sm:w-auto">
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
