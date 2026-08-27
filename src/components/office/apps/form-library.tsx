"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Globe, Plus, Search } from "lucide-react";
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
  onSelectForm: (form: FormRecordSummary) => void;
  onNewForm: () => void;
};

export function FormLibrary({
  forms,
  activeId,
  permissions,
  responseCounts,
  onSelectForm,
  onNewForm,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FormFilter>("all");
  const [sort, setSort] = useState<FormSort>("updated");

  const visibleForms = useMemo(
    () => browseForms({ forms, query, filter, sort, responseCounts }),
    [filter, forms, query, responseCounts, sort]
  );

  return (
    <aside className="flex min-h-0 flex-col border-b border-fuchsia-100 bg-fuchsia-50 p-4 xl:border-b-0 xl:border-r">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700">Your forms</p>
          <p className="mt-1 text-xs leading-relaxed text-fuchsia-900/70">Search, filter, and open any saved form.</p>
        </div>
        {permissions.canCreate ? (
          <Button size="sm" variant="outline" className="shrink-0 border-fuchsia-200 bg-white" onClick={onNewForm}>
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
          const responseCount = responseCounts.get(record.id) ?? 0;
          const isPublished = Boolean(record.metadata.published);
          const isActive = record.id === activeId;
          return (
            <button
              key={record.id}
              type="button"
              onClick={() => onSelectForm(record)}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition",
                isActive
                  ? "border-fuchsia-600 bg-fuchsia-600 text-white shadow-sm"
                  : "border-fuchsia-100 bg-white hover:border-fuchsia-200 hover:bg-fuchsia-50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold break-words">{record.title}</span>
                {isPublished ? (
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      isActive ? "bg-fuchsia-500 text-white" : "bg-emerald-50 text-emerald-700"
                    )}
                  >
                    <Globe className="h-3 w-3" />
                    Online
                  </span>
                ) : null}
              </div>
              {record.metadata.description || record.summary ? (
                <p className={cn("mt-1 line-clamp-2 text-xs", isActive ? "text-fuchsia-100" : "text-slate-500")}>
                  {record.metadata.description || record.summary}
                </p>
              ) : null}
              <p className={cn("mt-2 text-xs", isActive ? "text-fuchsia-100" : "text-slate-400")}>
                {responseCount} response{responseCount === 1 ? "" : "s"} · Updated{" "}
                {formatDistanceToNow(new Date(record.updatedAt), { addSuffix: true })}
              </p>
            </button>
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
