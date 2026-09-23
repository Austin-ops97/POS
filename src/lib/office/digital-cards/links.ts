import type { SocialNetwork } from "@/lib/validations/digital-cards";

export type CardAddressLines = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

const SOCIAL_NAMES: Record<SocialNetwork, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  X: "X",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  CUSTOM: "Link",
};

export function socialDisplayLabel(network: SocialNetwork, label: string) {
  if (network === "CUSTOM") return label.trim() || "Link";
  return SOCIAL_NAMES[network];
}

export function formatAddressText(address: CardAddressLines) {
  const locality = [address.city, [address.region, address.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [address.line1, address.line2, locality, address.country].filter(Boolean).join(", ");
}

export function mapsUrl(address: CardAddressLines) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(formatAddressText(address))}`;
}

export function telHref(number: string) {
  return `tel:${number.replace(/[^\d+]/g, "")}`;
}

export function websiteLabel(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
