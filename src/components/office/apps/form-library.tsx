"use client";

import { useMemo, useState } from "react";
import { Eye, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  browseForms,
  type FormFilter,
  type FormRecordSummary,
  type FormSort,
} from "@/lib/office/form-library";
import type { OfficeAppPermissions } from "./record-client";

const FILTERS: { id: FormFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Online" },
  { id: "draft", label: "Drafts" },
];

const SORTS: { id: FormSort; label: string }[] = [
  { id: "updated", label: "Recent" },
  { id: "name", label: "Name" },
  { id: "responses", label: "Responses" },
];

type Props = {
  forms: FormRecordSummary[];
  activeId: string;
  permissions: OfficeAppPermissions;
  responseCounts: Map<string, number>;
  onViewForm: (form: FormRecordSummary) => void;
  onEditForm: (form: FormRecordSummary) => void;
  onNewForm: () => void;
};

export function FormLibrary({
  forms,
  activeId,
  permissions,
  responseCounts,
  onViewForm,
  onEditForm,
  onNewForm,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FormFilter>("all");
  const [sort, setSort] = useState<FormSort>("updated");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleForms = useMemo(
    () => browseForms({ forms, query, filter, sort, responseCounts }),
    [filter, forms, query, responseCounts, sort]
  );

  function toggleExpanded(formId: string) {
    setExpandedId((current) => (current === formId ? null : formId));
  }

  return (
    <aside className="flex min-h-0 flex-col border-b border-fuchsia-100 bg-fuchsia-50 p-4 xl:border-b-0 xl:border-r">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700">Your forms</p>
          <p className="mt-1 text-xs leading-relaxed text-fuchsia-900/70">Tap a form to View or Edit it.</p>
        </div>
        {permissions.canCreate ? (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-fuchsia-200 bg-white"
            onClick={() => {
              setExpandedId(null);
              onNewForm();
            }}
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        ) : null}
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fuchsia-400" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search forms"
          className="border-fuchsia-200 bg-white pl-9 shadow-none focus-visible:ring-fuchsia-300"
          aria-label="Search forms"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              filter === item.id ? "bg-fuchsia-600 text-white" : "bg-white text-fuchsia-900 hover:bg-fuchsia-100"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-xs font-medium text-fuchsia-900/70">
        Sort by
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as FormSort)}
          className="mt-1 h-9 w-full rounded-lg border border-fuchsia-200 bg-white px-3 text-sm text-slate-700"
          aria-label="Sort forms"
        >
          {SORTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {visibleForms.map((record) => {
          const isExpanded = expandedId === record.id;
          const isOpen = record.id === activeId;
          return (
            <div
              key={record.id}
              className={cn(
                "rounded-xl border bg-white transition",
                isExpanded || isOpen ? "border-fuchsia-300 shadow-sm" : "border-fuchsia-100 hover:border-fuchsia-200"
              )}
            >
              <button
                type="button"
                onClick={() => toggleExpanded(record.id)}
                className="flex w-full items-center gap-2 p-3 text-left"
                aria-expanded={isExpanded}
                aria-controls={`form-actions-${record.id}`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{record.title}</span>
              </button>

              {isExpanded ? (
                <div id={`form-actions-${record.id}`} className="flex gap-2 border-t border-fuchsia-100 px-3 pb-3 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      onViewForm(record);
                      setExpandedId(null);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-700"
                    disabled={!permissions.canEdit}
                    onClick={() => {
                      onEditForm(record);
                      setExpandedId(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}

        {!visibleForms.length ? (
          <div className="rounded-xl border border-dashed border-fuchsia-200 p-4 text-sm text-fuchsia-900/60">
            {query.trim() || filter !== "all"
              ? "No forms match your search or filters."
              : "No saved forms yet. Click New, add your questions, then Save form."}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
