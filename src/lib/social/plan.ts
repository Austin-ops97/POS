export type SocialPlatformName = "FACEBOOK" | "INSTAGRAM" | "LINKEDIN";

export const PLATFORM_LIMITS: Record<SocialPlatformName, { text: number; requiresImage: boolean }> = {
  FACEBOOK: { text: 63206, requiresImage: false },
  INSTAGRAM: { text: 2200, requiresImage: true },
  LINKEDIN: { text: 3000, requiresImage: false },
};

export function composedCaption(platform: SocialPlatformName, text: string, link: string | null): string {
  if (platform === "INSTAGRAM" && link) return [text.trim(), link].filter(Boolean).join("\n");
  return text.trim();
}

export function platformIssue(
  platform: SocialPlatformName,
  input: { text: string; link: string | null; hasImage: boolean },
): string | null {
  const limit = PLATFORM_LIMITS[platform];
  if (limit.requiresImage && !input.hasImage) {
    return "Instagram feed posts need an image. Facebook and LinkedIn can still publish.";
  }
  const caption = composedCaption(platform, input.text, input.link);
  if (!caption && !input.hasImage) return "Add text, an image, or a link.";
  if (caption.length > limit.text) {
    return `${platformLabel(platform)} allows ${limit.text} characters. This post has ${caption.length}.`;
  }
  return null;
}

export function platformLabel(platform: SocialPlatformName): string {
  if (platform === "FACEBOOK") return "Facebook";
  if (platform === "INSTAGRAM") return "Instagram";
  return "LinkedIn";
}

export function summarizeDeliveries(statuses: Array<"PUBLISHED" | "FAILED" | "SCHEDULED">): "PUBLISHED" | "PARTIAL" | "FAILED" | "SCHEDULED" {
  if (statuses.length === 0) return "FAILED";
  if (statuses.every((status) => status === "SCHEDULED")) return "SCHEDULED";
  const published = statuses.filter((status) => status === "PUBLISHED").length;
  const failed = statuses.filter((status) => status === "FAILED").length;
  if (published > 0 && failed > 0) return "PARTIAL";
  if (published > 0 && published === statuses.length) return "PUBLISHED";
  if (failed > 0 && published === 0) return "FAILED";
  return "PARTIAL";
}

export function publishStatusMessage(status: string): string {
  if (status === "SCHEDULED") return "Post scheduled";
  if (status === "PUBLISHED") return "Published to every selected account";
  if (status === "PARTIAL") return "Published on some accounts. Retry the ones that failed from social history.";
  if (status === "FAILED") return "Nothing was published. Check the account connection and try again.";
  return "Publish finished";
}

export function retryableDeliveryIds(rows: { id: string; status: string }[]): string[] {
  return rows.filter((row) => row.status === "FAILED").map((row) => row.id);
}

export function socialPostWhere(
  businessId: string,
  filters: { status?: "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "PARTIAL" | "FAILED" | null } = {},
) {
  return {
    businessId,
    ...(filters.status ? { status: filters.status } : {}),
  };
}

export function socialConnectionWhere(businessId: string, filters: { platform?: SocialPlatformName | null } = {}) {
  return {
    businessId,
    ...(filters.platform ? { platform: filters.platform } : {}),
  };
}
