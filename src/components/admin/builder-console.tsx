"use client";

import { useCallback, useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHECKLIST_STEPS } from "@/lib/builder/checklist";
import { BUILDER_PLANS, type BuilderPlanKey } from "@/lib/builder/plans";
import { PlatformCredentials } from "@/components/admin/platform-credentials";

type BusinessRow = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  type: string;
  planKey: string;
  customized: boolean;
  employees: number;
  locations: number;
};

type ConnectionRow = {
  id: string;
  label: string;
  scope: string;
  status: string;
  tone: "ok" | "warn" | "bad" | "neutral";
  detail: string;
  href?: string;
  hrefLabel?: string;
};

type Detail = {
  business: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    type: string;
    status: string;
    createdAt: string;
    employees: number;
    locations: number;
    orders: number;
  };
  plan: {
    key: string;
    customized: boolean;
    integrations: Array<{ id: string; label: string; note: string }>;
  };
  flags: Record<string, boolean>;
  enabledCount: number;
  catalog: Array<{ id: string; label: string; features: Array<{ key: string; name: string; description: string }> }>;
  checklist: Record<string, boolean>;
  connections: { platform: ConnectionRow[]; business: ConnectionRow[] };
};

type AuditEvent = {
  id: string;
  action: string;
  actorEmail: string | null;
  businessId: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
};

const TONE: Record<ConnectionRow["tone"], "success" | "warning" | "destructive" | "secondary"> = {
  ok: "success",
  warn: "warning",
  bad: "destructive",
  neutral: "secondary",
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Request failed";
}

export function BuilderConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("business") ?? "";
  const [query, setQuery] = useState("");
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [auditScope, setAuditScope] = useState<"business" | "all">("business");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    type: "HYBRID",
    planKey: "STARTER" as BuilderPlanKey,
    ownerName: "",
    ownerEmail: "",
  });

  const selectBusiness = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("business", id);
      else params.delete("business");
      router.replace(`/admin/builder?${params.toString()}`);
    },
    [router, searchParams]
  );

  const loadList = useCallback(async (q: string) => {
    const response = await fetch(`/api/builder/businesses?q=${encodeURIComponent(q)}`);
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    const body = (await response.json()) as { businesses: BusinessRow[] };
    setBusinesses(body.businesses);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    const response = await fetch(`/api/builder/businesses/${id}`);
    if (!response.ok) {
      toast.error(await readError(response));
      setDetail(null);
      return;
    }
    setDetail((await response.json()) as Detail);
  }, []);

  const loadAudit = useCallback(async (id: string, scope: "business" | "all") => {
    const param = scope === "business" && id ? `?businessId=${encodeURIComponent(id)}` : "";
    const response = await fetch(`/api/builder/audit${param}`);
    if (!response.ok) return;
    const body = (await response.json()) as { events: AuditEvent[] };
    setEvents(body.events);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadList(query);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, loadList]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    void loadAudit(selectedId, auditScope);
  }, [selectedId, auditScope, loadAudit]);

  async function toggleFeature(module: string, enabled: boolean) {
    if (!selectedId) return;
    const response = await fetch(`/api/builder/businesses/${selectedId}/features`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module, enabled }),
    });
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    await loadDetail(selectedId);
    await loadAudit(selectedId, auditScope);
  }

  async function applyPlan(planKey: BuilderPlanKey) {
    if (!selectedId) return;
    const response = await fetch(`/api/builder/businesses/${selectedId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planKey }),
    });
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    toast.success(`${BUILDER_PLANS[planKey].label} applied`);
    await loadDetail(selectedId);
    await loadList(query);
    await loadAudit(selectedId, auditScope);
  }

  async function setChecklist(key: string, value: boolean) {
    if (!selectedId) return;
    const response = await fetch(`/api/builder/businesses/${selectedId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    await loadDetail(selectedId);
    await loadAudit(selectedId, auditScope);
  }

  async function createBusiness(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setInviteUrl(null);
    const response = await fetch("/api/builder/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (!response.ok) {
      toast.error(await readError(response));
      return;
    }
    const body = (await response.json()) as { businessId: string; invitationUrl?: string | null };
    toast.success("Business created");
    if (body.invitationUrl) setInviteUrl(body.invitationUrl);
    setForm((current) => ({ ...current, name: "", email: "", ownerName: "", ownerEmail: "" }));
    await loadList(query);
    selectBusiness(body.businessId);
  }

  async function lock() {
    await fetch("/api/builder/lock", { method: "POST" });
    window.location.assign("/admin/builder");
  }

  const planLabel =
    detail && detail.plan.key in BUILDER_PLANS
      ? BUILDER_PLANS[detail.plan.key as BuilderPlanKey].label
      : "Custom";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Builder</h1>
          <p className="text-sm text-slate-500">Onboard a business, set its plan, and store platform app credentials.</p>
        </div>
        <Button variant="outline" onClick={() => void lock()}>
          Lock Builder
        </Button>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="workspace">Businesses</TabsTrigger>
          <TabsTrigger value="credentials">Platform credentials</TabsTrigger>
        </TabsList>
        <TabsContent value="credentials" className="mt-4">
          <PlatformCredentials />
        </TabsContent>
        <TabsContent value="workspace" className="mt-4">
      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <Label htmlFor="builder-search">Business</Label>
          <Input
            id="builder-search"
            value={query}
            placeholder="Search name or email"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-80 space-y-1 overflow-auto">
            {businesses.length === 0 ? <p className="px-1 py-2 text-sm text-slate-500">No businesses match.</p> : null}
            {businesses.map((business) => (
              <button
                key={business.id}
                type="button"
                onClick={() => selectBusiness(business.id)}
                className={`w-full rounded-md px-2 py-2 text-left text-sm ${
                  business.id === selectedId ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                }`}
              >
                <span className="block font-medium">{business.name}</span>
                <span className={`block text-xs ${business.id === selectedId ? "text-slate-300" : "text-slate-500"}`}>
                  {business.planKey}
                  {business.customized ? " · overrides" : ""} · {business.status}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          {!detail ? (
            <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">
              Select a business, or create one below.
            </div>
          ) : (
            <Tabs defaultValue="overview">
              <TabsList className="flex h-auto flex-wrap justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="features">Features & plans</TabsTrigger>
                <TabsTrigger value="connections">Connections</TabsTrigger>
                <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Plan" value={detail.plan.customized ? `${planLabel} + overrides` : planLabel} />
                  <Stat label="Features on" value={`${detail.enabledCount}`} />
                  <Stat label="People" value={`${detail.business.employees} employees`} />
                  <Stat label="Orders" value={`${detail.business.orders}`} />
                </div>
                <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{detail.business.name}</p>
                  <p>{detail.business.type} · {detail.business.status}</p>
                  <p>{detail.business.email || "No email"} · {detail.business.locations} locations</p>
                  <p className="mt-2 text-slate-500">
                    Missing feature rows stay on, so existing businesses keep working until you apply a plan.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="features" className="mt-4 space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  Applying a plan writes every feature flag. Modules outside the plan turn off for this business. You can override any flag afterward.
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {(Object.keys(BUILDER_PLANS) as BuilderPlanKey[]).map((key) => (
                    <div key={key} className="rounded-lg border bg-white p-3">
                      <p className="font-medium">{BUILDER_PLANS[key].label}</p>
                      <p className="mt-1 min-h-12 text-sm text-slate-500">{BUILDER_PLANS[key].description}</p>
                      <Button className="mt-3" size="sm" variant={detail.plan.key === key ? "default" : "outline"} onClick={() => void applyPlan(key)}>
                        Apply {BUILDER_PLANS[key].label}
                      </Button>
                    </div>
                  ))}
                </div>
                {detail.catalog.map((group) => (
                  <section key={group.id} className="space-y-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{group.label}</h2>
                    <div className="grid gap-2 md:grid-cols-2">
                      {group.features.map((feature) => (
                        <label key={feature.key} className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
                          <span>
                            <span className="block text-sm font-medium">{feature.name}</span>
                            <span className="block text-xs text-slate-500">{feature.description}</span>
                          </span>
                          <Switch
                            checked={Boolean(detail.flags[feature.key])}
                            onCheckedChange={(enabled) => void toggleFeature(feature.key, enabled)}
                            aria-label={feature.name}
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </TabsContent>

              <TabsContent value="connections" className="mt-4 space-y-4">
                <ConnectionList title="Platform credentials" rows={detail.connections.platform} />
                <ConnectionList title="This business" rows={detail.connections.business} />
                <p className="text-xs text-slate-500">
                  Workspace links use the signed-in business. EmeraldOne does not ask for bank or social passwords and does not show OAuth tokens.
                </p>
              </TabsContent>

              <TabsContent value="onboarding" className="mt-4 space-y-4">
                <OnboardingForm
                  form={form}
                  setForm={setForm}
                  creating={creating}
                  inviteUrl={inviteUrl}
                  onSubmit={createBusiness}
                />
                <div className="rounded-lg border bg-white p-4">
                  <h2 className="font-medium">Checklist for {detail.business.name}</h2>
                  {detail.plan.integrations.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                      {detail.plan.integrations.map((item) => (
                        <li key={item.id}>
                          <span className="font-medium text-slate-800">{item.label}.</span> {item.note}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Apply a plan to see which integrations that bundle expects.</p>
                  )}
                  <div className="mt-4 space-y-2">
                    {CHECKLIST_STEPS.map((step) => (
                      <label key={step.key} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={Boolean(detail.checklist[step.key])}
                          onChange={(event) => void setChecklist(step.key, event.target.checked)}
                        />
                        {step.label}
                      </label>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="audit" className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Button size="sm" variant={auditScope === "business" ? "default" : "outline"} onClick={() => setAuditScope("business")}>
                    This business
                  </Button>
                  <Button size="sm" variant={auditScope === "all" ? "default" : "outline"} onClick={() => setAuditScope("all")}>
                    All Builder events
                  </Button>
                </div>
                <div className="overflow-hidden rounded-lg border bg-white">
                  {events.length === 0 ? <p className="p-4 text-sm text-slate-500">No Builder events yet.</p> : null}
                  <ul className="divide-y">
                    {events.map((event) => (
                      <li key={event.id} className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">{event.action}</span>
                          <span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-slate-500">{event.actorEmail || "Unknown"}{event.ipAddress ? ` · ${event.ipAddress}` : ""}</p>
                        {event.details ? (
                          <pre className="mt-1 overflow-auto text-xs text-slate-600">{JSON.stringify(event.details)}</pre>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          )}
          {!detail ? (
            <div className="mt-4">
              <OnboardingForm
                form={form}
                setForm={setForm}
                creating={creating}
                inviteUrl={inviteUrl}
                onSubmit={createBusiness}
              />
            </div>
          ) : null}
        </div>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ConnectionList({ title, rows }: { title: string; rows: ConnectionRow[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="divide-y rounded-lg border bg-white">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-slate-500">{row.detail}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={TONE[row.tone]}>{statusLabel(row.status)}</Badge>
              {row.href ? (
                <Link href={row.href} className="text-xs font-medium text-slate-700 underline-offset-2 hover:underline">
                  {row.hrefLabel || "Open"}
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OnboardingForm({
  form,
  setForm,
  creating,
  inviteUrl,
  onSubmit,
}: {
  form: {
    name: string;
    email: string;
    type: string;
    planKey: BuilderPlanKey;
    ownerName: string;
    ownerEmail: string;
  };
  setForm: Dispatch<SetStateAction<{
    name: string;
    email: string;
    type: string;
    planKey: BuilderPlanKey;
    ownerName: string;
    ownerEmail: string;
  }>>;
  creating: boolean;
  inviteUrl: string | null;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border bg-white p-4">
      <h2 className="font-medium">New business</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="new-business-name">Name</Label>
          <Input id="new-business-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-business-email">Business email</Label>
          <Input id="new-business-email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-business-plan">Plan</Label>
          <select
            id="new-business-plan"
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
            value={form.planKey}
            onChange={(event) => setForm((current) => ({ ...current, planKey: event.target.value as BuilderPlanKey }))}
          >
            {(Object.keys(BUILDER_PLANS) as BuilderPlanKey[]).map((key) => (
              <option key={key} value={key}>{BUILDER_PLANS[key].label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-owner-email">Owner email</Label>
          <Input id="new-owner-email" type="email" value={form.ownerEmail} onChange={(event) => setForm((current) => ({ ...current, ownerEmail: event.target.value }))} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label htmlFor="new-owner-name">Owner name</Label>
          <Input id="new-owner-name" value={form.ownerName} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))} />
        </div>
      </div>
      <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create business"}</Button>
      {inviteUrl ? (
        <p className="break-all rounded-md bg-slate-50 p-2 text-xs text-slate-700">
          Owner invite, shown once: {inviteUrl}
        </p>
      ) : null}
    </form>
  );
}
