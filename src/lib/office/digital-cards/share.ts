import type { Metadata } from "next";

export type CardShareInput = {
  businessName: string;
  personName: string;
  jobTitle?: string | null;
  note?: string | null;
  pageUrl?: string | null;
  imageUrl?: string | null;
};

export type ShareTag = { property?: string; name?: string; content: string };

export function cardShareMetadata(input: CardShareInput) {
  const businessName = input.businessName.trim();
  const personName = input.personName.trim();
  const title = personName ? `${personName} · ${businessName}` : businessName;
  const description =
    input.note?.trim() ||
    [input.jobTitle?.trim(), businessName].filter(Boolean).join(" · ") ||
    "Digital business card";
  const image = input.imageUrl?.trim() || null;
  const tags: ShareTag[] = [
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: businessName },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (input.pageUrl) tags.push({ property: "og:url", content: input.pageUrl });
  if (image) {
    tags.push({ property: "og:image", content: image });
    tags.push({ property: "og:image:alt", content: businessName });
    tags.push({ name: "twitter:image", content: image });
  }
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website" as const,
      siteName: businessName,
      ...(input.pageUrl ? { url: input.pageUrl } : {}),
      ...(image ? { images: [{ url: image, alt: businessName }] } : {}),
    },
    twitter: {
      card: "summary" as const,
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    tags,
  };
}

export function metadataFromShare(share: ReturnType<typeof cardShareMetadata>): Metadata {
  return {
    title: share.title,
    description: share.description,
    openGraph: share.openGraph,
    twitter: share.twitter,
  };
}

export function absoluteUrl(origin: string, value: string | null | undefined) {
  if (!value) return null;
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  if (!origin || !value.startsWith("/")) return null;
  return `${origin.replace(/\/$/, "")}${value}`;
}
