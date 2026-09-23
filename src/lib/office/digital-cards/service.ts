import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import {
  digitalCardCreateSchema,
  digitalCardWriteSchema,
  type DigitalCardWrite,
} from "@/lib/validations/digital-cards";
import {
  canEditDigitalCard,
  canViewAllDigitalCards,
  cardContentPatch,
  changedCardFields,
  DEFAULT_CARD_THEME,
  digitalCardAuditDetails,
  digitalCardListWhere,
  digitalCardLookupWhere,
  generateCardSlug,
  isCardSlug,
  isPubliclyReadable,
  normalizeTheme,
  publishedCardScope,
  resolveCardSlug,
} from "./access";
import { deleteCardLogoBlob, parseCardLogoDataUrl, persistCardLogo } from "./logo";
import { inspectPasskit } from "./passkit";

const cardInclude = {
  phones: { orderBy: { sortOrder: "asc" as const } },
  addresses: { orderBy: { sortOrder: "asc" as const } },
  socialLinks: { orderBy: { sortOrder: "asc" as const } },
  createdBy: { select: { id: true, name: true } },
} satisfies PrismaTypes.DigitalBusinessCardInclude;

type CardRecord = PrismaTypes.DigitalBusinessCardGetPayload<{ include: typeof cardInclude }>;

function permissions(ctx: AuthContext) {
  return {
    view: hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS),
    create: hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS),
    edit: hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS),
  };
}

function requireCardPermission(ctx: AuthContext, kind: "view" | "create") {
  const flags = permissions(ctx);
  if (kind === "view" && !flags.view && !flags.create && !flags.edit) {
    throw new Error(`Missing permission: ${PERMISSIONS.VIEW_DOCUMENTS}`);
  }
  if (kind === "create" && !flags.create && !flags.edit) {
    throw new Error(`Missing permission: ${PERMISSIONS.CREATE_DOCUMENTS}`);
  }
  return flags;
}

function httpUrlOrEmpty(value: string | null | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return value;
  } catch {
    return "";
  }
  return "";
}

function writeFromCard(card: CardRecord): DigitalCardWrite {
  return digitalCardWriteSchema.parse({
    businessName: card.businessName,
    personName: card.personName,
    jobTitle: card.jobTitle ?? "",
    email: card.email ?? "",
    website: card.website ?? "",
    note: card.note ?? "",
    theme: normalizeTheme(card.theme),
    phones: card.phones.map((phone) => ({
      label: phone.label,
      number: phone.number,
      visible: phone.visible,
    })),
    addresses: card.addresses.map((address) => ({
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      visible: address.visible,
    })),
    socialLinks: card.socialLinks.map((link) => ({
      network: link.network,
      label: link.label,
      url: link.url,
      visible: link.visible,
    })),
  });
}

export function cardLogoPath(card: { id: string; slug: string | null; logoUrl: string | null; logoMime: string | null }, audience: "office" | "public") {
  if (card.logoUrl && /^https:\/\//i.test(card.logoUrl)) return card.logoUrl;
  if (!card.logoMime) return null;
  if (audience === "public" && card.slug) return `/api/public/cards/${card.slug}/logo`;
  return `/api/office/cards/${card.id}/logo`;
}

export function toPrivateCard(ctx: AuthContext, card: CardRecord) {
  const flags = permissions(ctx);
  const wallet = inspectPasskit();
  return {
    id: card.id,
    slug: card.slug,
    status: card.status,
    publishedAt: card.publishedAt?.toISOString() ?? null,
    businessName: card.businessName,
    personName: card.personName,
    jobTitle: card.jobTitle ?? "",
    email: card.email ?? "",
    website: card.website ?? "",
    note: card.note ?? "",
    logoUrl: cardLogoPath(card, "office"),
    theme: normalizeTheme(card.theme),
    phones: card.phones.map((phone) => ({
      id: phone.id,
      label: phone.label,
      number: phone.number,
      visible: phone.visible,
    })),
    addresses: card.addresses.map((address) => ({
      id: address.id,
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      visible: address.visible,
    })),
    socialLinks: card.socialLinks.map((link) => ({
      id: link.id,
      network: link.network,
      label: link.label,
      url: link.url,
      visible: link.visible,
    })),
    canEdit: canEditDigitalCard({
      actorBusinessId: ctx.business.id,
      actorEmployeeId: ctx.employee.id,
      permissions: flags,
      card,
    }),
    publicPath: card.slug ? `/c/${card.slug}` : null,
    wallet,
    createdBy: card.createdBy,
    updatedAt: card.updatedAt.toISOString(),
  };
}

export type PrivateCardDto = ReturnType<typeof toPrivateCard>;

export function toPublicCard(card: CardRecord) {
  if (!isPubliclyReadable(card) || !card.slug) return null;
  return {
    slug: card.slug,
    businessName: card.businessName,
    personName: card.personName,
    jobTitle: card.jobTitle ?? "",
    email: card.email ?? "",
    website: card.website ?? "",
    note: card.note ?? "",
    logoUrl: cardLogoPath(card, "public"),
    theme: normalizeTheme(card.theme),
    phones: card.phones
      .filter((phone) => phone.visible)
      .map((phone) => ({ label: phone.label, number: phone.number, visible: true })),
    addresses: card.addresses
      .filter((address) => address.visible)
      .map((address) => ({
        label: address.label,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
        visible: true,
      })),
    socialLinks: card.socialLinks
      .filter((link) => link.visible)
      .map((link) => ({
        network: link.network,
        label: link.label,
        url: link.url,
        visible: true,
      })),
    walletAvailable: inspectPasskit().ready,
  };
}

export type PublicCardDto = NonNullable<ReturnType<typeof toPublicCard>>;

function nestedCreate(input: DigitalCardWrite) {
  return {
    phones: {
      create: input.phones.map((phone, index) => ({
        label: phone.label,
        number: phone.number,
        visible: phone.visible,
        sortOrder: index,
      })),
    },
    addresses: {
      create: input.addresses.map((address, index) => ({
        label: address.label,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        region: address.region,
        postalCode: address.postalCode,
        country: address.country,
        visible: address.visible,
        sortOrder: index,
      })),
    },
    socialLinks: {
      create: input.socialLinks.map((link, index) => ({
        network: link.network,
        label: link.label,
        url: link.url,
        visible: link.visible,
        sortOrder: index,
      })),
    },
  };
}

function draftFromContext(ctx: AuthContext, raw: unknown): DigitalCardWrite {
  const parsed = digitalCardCreateSchema.parse(raw ?? {});
  const location = ctx.location;
  const address =
    location?.street
      ? [
          {
            label: location.name || "Office",
            line1: location.street,
            line2: "",
            city: location.city ?? "",
            region: location.state ?? "",
            postalCode: location.zip ?? "",
            country: location.country ?? "",
            visible: true,
          },
        ]
      : [];
  const phone = [ctx.employee.phone, ctx.employee.mobilePhone, ctx.business.phone].find(
    (value) => (value?.match(/\d/g) ?? []).length >= 7
  );
  return digitalCardWriteSchema.parse({
    businessName: (parsed.businessName || ctx.business.name).slice(0, 120),
    personName: (parsed.personName || ctx.employee.preferredName || ctx.employee.name).slice(0, 120),
    jobTitle: (parsed.jobTitle ?? ctx.employee.jobTitle ?? "").slice(0, 120),
    email: parsed.email ?? ctx.employee.workEmail ?? ctx.employee.email ?? ctx.business.email ?? "",
    website: parsed.website ?? httpUrlOrEmpty(ctx.business.website),
    note: parsed.note ?? "",
    theme: {
      ...DEFAULT_CARD_THEME,
      ...(ctx.business.primaryColor && /^#[0-9a-fA-F]{6}$/.test(ctx.business.primaryColor)
        ? { accent: ctx.business.primaryColor }
        : {}),
      ...parsed.theme,
    },
    phones:
      parsed.phones ??
      (phone ? [{ label: "Work", number: phone, visible: true }] : []),
    addresses: parsed.addresses ?? address,
    socialLinks: parsed.socialLinks ?? [],
  });
}

export async function listDigitalCards(ctx: AuthContext) {
  const flags = requireCardPermission(ctx, "view");
  const cards = await db.digitalBusinessCard.findMany({
    where: digitalCardListWhere({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      viewAll: canViewAllDigitalCards(flags),
    }),
    include: cardInclude,
    orderBy: { updatedAt: "desc" },
  });
  return cards.map((card) => toPrivateCard(ctx, card));
}

export async function getDigitalCard(ctx: AuthContext, id: string) {
  const flags = requireCardPermission(ctx, "view");
  const card = await db.digitalBusinessCard.findFirst({
    where: digitalCardLookupWhere({
      businessId: ctx.business.id,
      employeeId: ctx.employee.id,
      viewAll: canViewAllDigitalCards(flags),
      id,
    }),
    include: cardInclude,
  });
  return card ? toPrivateCard(ctx, card) : null;
}

async function requireEditable(ctx: AuthContext, id: string) {
  const flags = requireCardPermission(ctx, "view");
  const card = await db.digitalBusinessCard.findFirst({
    where: { id, businessId: ctx.business.id },
    include: cardInclude,
  });
  if (!card) throw new Error("Card not found");
  const allowed = canEditDigitalCard({
    actorBusinessId: ctx.business.id,
    actorEmployeeId: ctx.employee.id,
    permissions: flags,
    card,
  });
  if (!allowed) throw new Error(`Missing permission: ${PERMISSIONS.EDIT_DOCUMENTS}`);
  if (!canViewAllDigitalCards(flags) && card.createdById !== ctx.employee.id) {
    throw new Error("Card not found");
  }
  return card;
}

export async function createDigitalCard(ctx: AuthContext, raw: unknown, ipAddress?: string) {
  requireCardPermission(ctx, "create");
  const input = draftFromContext(ctx, raw);
  const content = cardContentPatch(input);
  const logoUrl = ctx.business.logoUrl?.startsWith("https://") ? ctx.business.logoUrl : null;
  const card = await db.digitalBusinessCard.create({
    data: {
      businessId: ctx.business.id,
      createdById: ctx.employee.id,
      businessName: content.businessName,
      personName: content.personName,
      jobTitle: content.jobTitle,
      email: content.email,
      website: content.website,
      note: content.note,
      theme: content.theme,
      logoUrl,
      ...nestedCreate(input),
    },
    include: cardInclude,
  });
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "CREATE",
    entity: "DigitalBusinessCard",
    entityId: card.id,
    details: digitalCardAuditDetails("create", card),
    ipAddress,
  });
  return toPrivateCard(ctx, card);
}

export async function updateDigitalCard(ctx: AuthContext, id: string, raw: unknown, ipAddress?: string) {
  const current = await requireEditable(ctx, id);
  const input = digitalCardWriteSchema.parse(raw);
  const content = cardContentPatch(input);
  const fields = changedCardFields(writeFromCard(current), input);
  const card = await db.$transaction(async (tx) => {
    const owned = await tx.digitalBusinessCard.findFirst({
      where: { id, businessId: ctx.business.id },
      select: { id: true, slug: true },
    });
    if (!owned) throw new Error("Card not found");
    await tx.digitalCardPhone.deleteMany({ where: { cardId: id } });
    await tx.digitalCardAddress.deleteMany({ where: { cardId: id } });
    await tx.digitalCardSocialLink.deleteMany({ where: { cardId: id } });
    return tx.digitalBusinessCard.update({
      where: { id: owned.id },
      data: {
        businessName: content.businessName,
        personName: content.personName,
        jobTitle: content.jobTitle,
        email: content.email,
        website: content.website,
        note: content.note,
        theme: content.theme,
        ...nestedCreate(input),
      },
      include: cardInclude,
    });
  });
  if (card.slug !== current.slug) {
    throw new Error("Card link could not be kept stable");
  }
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "UPDATE",
    entity: "DigitalBusinessCard",
    entityId: card.id,
    details: digitalCardAuditDetails("update", card, fields),
    ipAddress,
  });
  return toPrivateCard(ctx, card);
}

export async function publishDigitalCard(ctx: AuthContext, id: string, ipAddress?: string) {
  const current = await requireEditable(ctx, id);
  let card = current;
  if (!current.slug) {
    let assigned = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = resolveCardSlug(null, true, generateCardSlug);
      try {
        const result = await db.digitalBusinessCard.updateMany({
          where: { id, businessId: ctx.business.id, slug: null },
          data: {
            slug,
            status: "PUBLISHED",
            publishedAt: new Date(),
            unpublishedAt: null,
          },
        });
        if (result.count === 1) {
          assigned = true;
          break;
        }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
      const raced = await db.digitalBusinessCard.findFirst({
        where: { id, businessId: ctx.business.id },
        select: { slug: true },
      });
      if (raced?.slug) {
        assigned = true;
        break;
      }
    }
    if (!assigned) throw new Error("Could not assign a public link");
  } else {
    await db.digitalBusinessCard.updateMany({
      where: { id, businessId: ctx.business.id, slug: current.slug },
      data: {
        status: "PUBLISHED",
        publishedAt: current.publishedAt ?? new Date(),
        unpublishedAt: null,
      },
    });
  }
  card = (await db.digitalBusinessCard.findFirst({
    where: { id, businessId: ctx.business.id },
    include: cardInclude,
  }))!;
  if (!card?.slug || (current.slug && card.slug !== current.slug)) {
    throw new Error("Card link could not be kept stable");
  }
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "UPDATE",
    entity: "DigitalBusinessCard",
    entityId: card.id,
    details: digitalCardAuditDetails("publish", card),
    ipAddress,
  });
  return toPrivateCard(ctx, card);
}

export async function unpublishDigitalCard(ctx: AuthContext, id: string, ipAddress?: string) {
  const current = await requireEditable(ctx, id);
  await db.digitalBusinessCard.updateMany({
    where: { id, businessId: ctx.business.id },
    data: { status: "UNPUBLISHED", unpublishedAt: new Date() },
  });
  const card = await db.digitalBusinessCard.findFirst({
    where: { id, businessId: ctx.business.id },
    include: cardInclude,
  });
  if (!card || card.slug !== current.slug) throw new Error("Card link could not be kept stable");
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "UPDATE",
    entity: "DigitalBusinessCard",
    entityId: card.id,
    details: digitalCardAuditDetails("unpublish", card),
    ipAddress,
  });
  return toPrivateCard(ctx, card);
}

export async function setDigitalCardLogo(ctx: AuthContext, id: string, dataUrl: string, ipAddress?: string) {
  const current = await requireEditable(ctx, id);
  const parsed = parseCardLogoDataUrl(dataUrl);
  const stored = await persistCardLogo({
    businessId: ctx.business.id,
    cardId: id,
    data: parsed.data,
    mimeType: parsed.mimeType,
    previousKey: current.logoStorageKey,
  });
  const card = await db.digitalBusinessCard.update({
    where: { id: current.id },
    data: {
      logoUrl: stored.logoUrl,
      logoStorageKey: stored.logoStorageKey,
      logoMime: stored.logoMime,
      logoData: stored.logoData,
    },
    include: cardInclude,
  });
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "UPDATE",
    entity: "DigitalBusinessCard",
    entityId: card.id,
    details: digitalCardAuditDetails("logo", card, ["logo"]),
    ipAddress,
  });
  return toPrivateCard(ctx, card);
}

export async function clearDigitalCardLogo(ctx: AuthContext, id: string, ipAddress?: string) {
  const current = await requireEditable(ctx, id);
  await deleteCardLogoBlob(current.logoStorageKey);
  const card = await db.digitalBusinessCard.update({
    where: { id: current.id },
    data: { logoUrl: null, logoStorageKey: null, logoMime: null, logoData: null },
    include: cardInclude,
  });
  await createAuditLog({
    businessId: ctx.business.id,
    employeeId: ctx.employee.id,
    action: "UPDATE",
    entity: "DigitalBusinessCard",
    entityId: card.id,
    details: digitalCardAuditDetails("logo", card, ["logo"]),
    ipAddress,
  });
  return toPrivateCard(ctx, card);
}

export async function getPublishedDigitalCard(slug: string) {
  if (!isCardSlug(slug)) return null;
  const card = await db.digitalBusinessCard.findFirst({
    where: publishedCardScope(slug),
    include: cardInclude,
  });
  if (!card || !isPubliclyReadable(card)) return null;
  return card;
}

export async function getPublishedCardLogo(slug: string) {
  if (!isCardSlug(slug)) return null;
  const card = await db.digitalBusinessCard.findFirst({
    where: publishedCardScope(slug),
    select: { logoUrl: true, logoMime: true, logoData: true, slug: true, status: true },
  });
  if (!card || !isPubliclyReadable(card)) return null;
  return card;
}

export async function getCardLogo(cardId: string, businessId: string) {
  return db.digitalBusinessCard.findFirst({
    where: { id: cardId, businessId },
    select: {
      id: true,
      slug: true,
      logoUrl: true,
      logoMime: true,
      logoData: true,
      businessId: true,
    },
  });
}
