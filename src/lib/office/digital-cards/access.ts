import { randomBytes } from "node:crypto";
import type { DigitalCardWrite } from "@/lib/validations/digital-cards";

export { DEFAULT_CARD_THEME, CARD_STYLE_PRESETS, cardPalette, normalizeTheme, safeHex } from "./theme";
export type { CardTheme } from "./theme";

const SLUG_PATTERN = /^[A-Za-z0-9_-]{10,22}$/;

export function isCardSlug(value: string) {
  return SLUG_PATTERN.test(value);
}

/** 72 bits, URL-safe, stable once stored. */
export function generateCardSlug() {
  return randomBytes(9).toString("base64url");
}

/**
 * The public slug is created on first publish and then immutable.
 * Draft saves and later edits must not replace it.
 */
export function resolveCardSlug(
  existing: string | null | undefined,
  publishing: boolean,
  generate: () => string = generateCardSlug
) {
  if (existing) return existing;
  if (!publishing) return null;
  return generate();
}

export function cardContentPatch(input: DigitalCardWrite) {
  return {
    businessName: input.businessName,
    personName: input.personName,
    jobTitle: input.jobTitle || null,
    email: input.email || null,
    website: input.website || null,
    note: input.note || null,
    theme: input.theme,
    phones: input.phones,
    addresses: input.addresses,
    socialLinks: input.socialLinks,
  };
}

const AUDIT_FIELDS = [
  "businessName",
  "personName",
  "jobTitle",
  "email",
  "website",
  "note",
  "theme",
  "phones",
  "addresses",
  "socialLinks",
] as const;

export function changedCardFields(before: DigitalCardWrite, after: DigitalCardWrite) {
  return AUDIT_FIELDS.filter(
    (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
  );
}

export function digitalCardAuditDetails(
  event: "create" | "update" | "publish" | "unpublish" | "logo",
  card: { slug: string | null; status: string },
  fields?: string[]
) {
  return {
    event,
    slug: card.slug,
    status: card.status,
    ...(fields && fields.length ? { fields } : {}),
  };
}

export function digitalCardListWhere(input: {
  businessId: string;
  employeeId: string;
  viewAll: boolean;
}) {
  return {
    businessId: input.businessId,
    ...(input.viewAll ? {} : { createdById: input.employeeId }),
  };
}

export function digitalCardLookupWhere(input: {
  businessId: string;
  employeeId: string;
  viewAll: boolean;
  id: string;
}) {
  return {
    id: input.id,
    ...digitalCardListWhere(input),
  };
}

/** Public reads never take an auth subject. Unpublished cards stay hidden. */
export function publishedCardScope(slug: string) {
  return { slug, status: "PUBLISHED" as const };
}

export function isPubliclyReadable(card: { status: string; slug: string | null }) {
  return card.status === "PUBLISHED" && Boolean(card.slug);
}

export function canEditDigitalCard(input: {
  actorBusinessId: string;
  actorEmployeeId: string;
  permissions: { edit: boolean; create: boolean };
  card: { businessId: string; createdById: string };
}) {
  if (input.card.businessId !== input.actorBusinessId) return false;
  if (input.permissions.edit) return true;
  return input.permissions.create && input.card.createdById === input.actorEmployeeId;
}

export function canViewAllDigitalCards(permissions: { view: boolean; edit: boolean }) {
  return permissions.view || permissions.edit;
}

export function publicCardUrl(origin: string, slug: string) {
  return `${origin.replace(/\/$/, "")}/c/${slug}`;
}

/** QR codes open the public page. They never embed a vCard. */
export function qrPayloadForCard(origin: string, slug: string) {
  const payload = publicCardUrl(origin, slug);
  if (!payload.startsWith("http://") && !payload.startsWith("https://")) {
    throw new Error("Invalid card link: set NEXT_PUBLIC_APP_URL so the QR code can open this card.");
  }
  if (/begin:vcard/i.test(payload)) {
    throw new Error("QR must open the card page");
  }
  return payload;
}

export function requestOrigin(
  headerList: { get(name: string): string | null },
  env: NodeJS.ProcessEnv = process.env
) {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim() || env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = (headerList.get("x-forwarded-host") || headerList.get("host") || "")
    .split(",")[0]
    ?.trim();
  if (!host) return "";
  const forwarded = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwarded || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function blankToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
