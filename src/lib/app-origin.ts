/** Public origin for emails and signing links. Never invent http for Vercel hosts. */
export function publicAppOrigin(requestOrigin?: string | null) {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  const fromRequest = requestOrigin?.trim().replace(/\/$/, "");
  if (fromRequest && /^https?:\/\//i.test(fromRequest)) return fromRequest;

  return "https://www.emeraldvalestudios.online";
}
