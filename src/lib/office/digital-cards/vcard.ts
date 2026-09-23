import type { SocialNetwork } from "@/lib/validations/digital-cards";
import { socialDisplayLabel } from "./links";

export { socialDisplayLabel };

export type VCardPhone = { label: string; number: string };
export type VCardAddress = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};
export type VCardSocial = { network: SocialNetwork; label: string; url: string };

export type VCardInput = {
  personName: string;
  businessName: string;
  jobTitle?: string | null;
  email?: string | null;
  website?: string | null;
  note?: string | null;
  phones: VCardPhone[];
  addresses: VCardAddress[];
  socialLinks: VCardSocial[];
};

const SOCIAL_TYPES: Record<SocialNetwork, string> = {
  INSTAGRAM: "instagram",
  FACEBOOK: "facebook",
  LINKEDIN: "linkedin",
  X: "twitter",
  TIKTOK: "tiktok",
  YOUTUBE: "youtube",
  CUSTOM: "link",
};

function escapeVCard(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string) {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (current && bytes + size > 74) {
      parts.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  if (current) parts.push(current);
  return parts.join("\r\n");
}

function phoneType(label: string) {
  const value = label.toLowerCase();
  if (value.includes("fax")) return "FAX";
  if (value.includes("home")) return "HOME";
  if (value.includes("mobile") || value.includes("cell")) return "CELL";
  return "WORK";
}

/** vCard 3.0 download. Scanning the card QR does not produce this file. */
export function buildDigitalCardVCard(input: VCardInput) {
  const name = input.personName.trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const family = parts.length > 1 ? parts[parts.length - 1] : "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(name)}`,
    `N:${escapeVCard(family)};${escapeVCard(given)};;;`,
    `ORG:${escapeVCard(input.businessName.trim())}`,
  ];
  if (input.jobTitle?.trim()) lines.push(`TITLE:${escapeVCard(input.jobTitle.trim())}`);
  for (const phone of input.phones) {
    if (!phone.number.trim()) continue;
    lines.push(`TEL;TYPE=${phoneType(phone.label)}:${escapeVCard(phone.number.trim())}`);
  }
  if (input.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(input.email.trim())}`);
  if (input.website?.trim()) lines.push(`URL:${escapeVCard(input.website.trim())}`);
  for (const address of input.addresses) {
    lines.push(
      `ADR;TYPE=WORK:;${escapeVCard(address.line2)};${escapeVCard(address.line1)};${escapeVCard(address.city)};${escapeVCard(address.region)};${escapeVCard(address.postalCode)};${escapeVCard(address.country)}`
    );
  }
  input.socialLinks.forEach((link, index) => {
    const label = socialDisplayLabel(link.network, link.label);
    const item = `item${index + 1}`;
    lines.push(`${item}.URL:${escapeVCard(link.url.trim())}`);
    lines.push(`${item}.X-ABLabel:${escapeVCard(label)}`);
    lines.push(
      `X-SOCIALPROFILE;TYPE=${SOCIAL_TYPES[link.network]}:${escapeVCard(link.url.trim())}`
    );
  });
  if (input.note?.trim()) lines.push(`NOTE:${escapeVCard(input.note.trim())}`);
  lines.push("END:VCARD");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function vCardFilename(personName: string) {
  const base = personName
    .trim()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "contact"}.vcf`;
}
