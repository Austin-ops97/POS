import { CARD_OG_ALT, CARD_OG_SIZE, loadCardOgResponse } from "@/lib/office/digital-cards/og-card";

export const alt = CARD_OG_ALT;
export const size = CARD_OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function TwitterImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return loadCardOgResponse(slug);
}
