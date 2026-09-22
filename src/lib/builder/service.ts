import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { safeBuilderAuditDetails } from "./audit";
import { mergeChecklist, parseChecklist, type ChecklistState } from "./checklist";
import { platformCredentialEnv } from "@/lib/credentials/vault";
import { platformIntegrationStatus, publicBusinessConnections } from "./connections";
import { resolveFeatureFlags } from "./entitlements";
import {
  builderFeatureCatalog,
  isBuilderPlanKey,
  moduleFlagsForPlan,
  planDiverged,
  planIntegrations,
  type BuilderPlanKey,
} from "./plans";

type Actor = {
  actorUserId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string;
};

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: Actor & {
    action: string;
    businessId?: string | null;
    details?: Record<string, unknown>;
    entity?: string;
  }
) {
  const details = safeBuilderAuditDetails(input.details);
  await tx.builderAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: input.action,
      businessId: input.businessId ?? null,
      details,
      ipAddress: input.ipAddress,
    },
  });
  if (input.businessId && input.entity) {
    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        action: "SETTINGS_CHANGE",
        entity: input.entity,
        entityId: input.businessId,
        details,
        ipAddress: input.ipAddress,
      },
    });
  }
}

export async function recordBuilderEvent(
  input: Actor & { action: string; businessId?: string | null; details?: Record<string, unknown> }
) {
  await db.builderAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      action: input.action,
      businessId: input.businessId ?? null,
      details: safeBuilderAuditDetails(input.details),
      ipAddress: input.ipAddress,
    },
  });
}

async function requireBusiness(id: string) {
  const business = await db.business.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!business) throw new Error("Business not found");
  return business;
}

export async function listBuilderBusinesses(query: string) {
  const q = query.trim();
  const businesses = await db.business.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { legalName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      type: true,
      createdAt: true,
      builderState: { select: { planKey: true, customized: true } },
      _count: { select: { employees: true, locations: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return businesses.map((business) => ({
    id: business.id,
    name: business.name,
    email: business.email,
    status: business.status,
    type: business.type,
    createdAt: business.createdAt,
    planKey: business.builderState?.planKey ?? "CUSTOM",
    customized: business.builderState?.customized ?? false,
    employees: business._count.employees,
    locations: business._count.locations,
  }));
}

async function loadConnectionRows(businessId: string) {
  const [stripe, quickbooks, bank, social] = await Promise.all([
    db.stripeAccount.findUnique({
      where: { businessId },
      select: { status: true, chargesEnabled: true, payoutsEnabled: true },
    }),
    db.quickBooksConnection.findUnique({
      where: { businessId },
      select: { status: true, companyName: true, lastSyncError: true, environment: true },
    }),
    db.bankConnection.findUnique({
      where: { businessId },
      select: { status: true, institutionName: true, lastSyncError: true },
    }),
    db.socialConnection.findMany({
      where: { businessId },
      select: { platform: true, status: true, displayName: true, lastSyncError: true },
      orderBy: { platform: "asc" },
    }),
  ]);
  return { stripe, quickbooks, bank, social };
}

export async function builderConnections(businessId: string | null) {
  const platform = platformIntegrationStatus(await platformCredentialEnv());
  if (!businessId) return { platform, business: [] as ReturnType<typeof publicBusinessConnections> };
  await requireBusiness(businessId);
  const rows = await loadConnectionRows(businessId);
  return { platform, business: publicBusinessConnections(rows) };
}

export async function getBuilderBusiness(id: string) {
  const business = await db.business.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      legalName: true,
      email: true,
      phone: true,
      type: true,
      status: true,
      createdAt: true,
      builderState: true,
      moduleSettings: { select: { module: true, enabled: true } },
      _count: { select: { employees: true, locations: true, orders: true } },
    },
  });
  if (!business) throw new Error("Business not found");
  const flags = resolveFeatureFlags(business.moduleSettings);
  const planKey = business.builderState?.planKey ?? "CUSTOM";
  const customized = isBuilderPlanKey(planKey) ? planDiverged(planKey, flags) : false;
  const connections = await builderConnections(id);
  const enabledCount = Object.values(flags).filter(Boolean).length;
  return {
    business: {
      id: business.id,
      name: business.name,
      legalName: business.legalName,
      email: business.email,
      phone: business.phone,
      type: business.type,
      status: business.status,
      createdAt: business.createdAt,
      employees: business._count.employees,
      locations: business._count.locations,
      orders: business._count.orders,
    },
    plan: {
      key: planKey,
      customized: business.builderState?.customized || customized,
      integrations: planIntegrations(planKey),
    },
    flags,
    enabledCount,
    catalog: builderFeatureCatalog(),
    checklist: parseChecklist(business.builderState?.checklist),
    connections,
  };
}

export async function setBusinessFeature(
  input: Actor & { businessId: string; module: string; enabled: boolean }
) {
  await requireBusiness(input.businessId);
  await db.$transaction(async (tx) => {
    await tx.moduleSetting.upsert({
      where: { businessId_module: { businessId: input.businessId, module: input.module } },
      create: { businessId: input.businessId, module: input.module, enabled: input.enabled },
      update: { enabled: input.enabled },
    });
    const [rows, state] = await Promise.all([
      tx.moduleSetting.findMany({
        where: { businessId: input.businessId },
        select: { module: true, enabled: true },
      }),
      tx.builderBusinessState.findUnique({ where: { businessId: input.businessId } }),
    ]);
    const flags = resolveFeatureFlags(rows);
    const planKey = state?.planKey ?? "CUSTOM";
    const customized = planDiverged(planKey, flags);
    const checklist = mergeChecklist(state?.checklist, { featuresReviewed: true, businessReady: true });
    await tx.builderBusinessState.upsert({
      where: { businessId: input.businessId },
      create: {
        businessId: input.businessId,
        planKey,
        customized,
        checklist,
      },
      update: { customized, checklist },
    });
    await writeAudit(tx, {
      ...input,
      action: "FEATURE_TOGGLE",
      entity: "BuilderEntitlement",
      details: { module: input.module, enabled: input.enabled, planKey, customized },
    });
  });
}

export async function applyBusinessPlan(input: Actor & { businessId: string; planKey: BuilderPlanKey }) {
  await requireBusiness(input.businessId);
  const flags = moduleFlagsForPlan(input.planKey);
  await db.$transaction(async (tx) => {
    for (const [module, enabled] of Object.entries(flags)) {
      await tx.moduleSetting.upsert({
        where: { businessId_module: { businessId: input.businessId, module } },
        create: { businessId: input.businessId, module, enabled },
        update: { enabled },
      });
    }
    const state = await tx.builderBusinessState.findUnique({ where: { businessId: input.businessId } });
    const checklist = mergeChecklist(state?.checklist, { planApplied: true, businessReady: true });
    await tx.builderBusinessState.upsert({
      where: { businessId: input.businessId },
      create: {
        businessId: input.businessId,
        planKey: input.planKey,
        customized: false,
        checklist,
      },
      update: { planKey: input.planKey, customized: false, checklist },
    });
    await writeAudit(tx, {
      ...input,
      action: "PLAN_APPLY",
      entity: "BuilderEntitlement",
      details: {
        planKey: input.planKey,
        enabled: Object.entries(flags).filter(([, on]) => on).map(([key]) => key),
      },
    });
  });
}

export async function updateBusinessChecklist(
  input: Actor & { businessId: string; patch: Partial<ChecklistState> }
) {
  await requireBusiness(input.businessId);
  await db.$transaction(async (tx) => {
    const state = await tx.builderBusinessState.findUnique({ where: { businessId: input.businessId } });
    const checklist = mergeChecklist(state?.checklist, input.patch);
    await tx.builderBusinessState.upsert({
      where: { businessId: input.businessId },
      create: {
        businessId: input.businessId,
        planKey: "CUSTOM",
        customized: false,
        checklist,
      },
      update: { checklist },
    });
    await writeAudit(tx, {
      ...input,
      action: "CHECKLIST_UPDATE",
      entity: "BuilderOnboarding",
      details: { checklist },
    });
  });
}

export async function listBuilderAudit(businessId: string | null) {
  const events = await db.builderAuditEvent.findMany({
    where: businessId ? { businessId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      actorEmail: true,
      businessId: true,
      details: true,
      ipAddress: true,
      createdAt: true,
    },
  });
  return events;
}
