import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GlassBusinessCard } from "@/components/office/cards/glass-card";
import { publicCardUrl, requestOrigin } from "@/lib/office/digital-cards/access";
import { absoluteUrl, cardShareMetadata, metadataFromShare } from "@/lib/office/digital-cards/share";
import { getPublishedDigitalCard, toPublicCard } from "@/lib/office/digital-cards/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const card = await getPublishedDigitalCard(slug);
  const pub = card ? toPublicCard(card) : null;
  if (!card || !pub) return { title: "Card unavailable" };
  const origin = requestOrigin(await headers());
  return metadataFromShare(
    cardShareMetadata({
      businessName: pub.businessName,
      personName: pub.personName,
      jobTitle: pub.jobTitle,
      note: pub.note,
      pageUrl: origin ? publicCardUrl(origin, pub.slug) : null,
      imageUrl: absoluteUrl(origin, pub.logoUrl),
    })
  );
}

export default async function PublicDigitalCardPage({ params }: Params) {
  const { slug } = await params;
  const card = await getPublishedDigitalCard(slug);
  const pub = card ? toPublicCard(card) : null;
  if (!pub) notFound();
  return (
    <GlassBusinessCard
      card={pub}
      mode="public"
      layout="page"
      saveHref={`/api/public/cards/${pub.slug}/vcard`}
      walletHref={pub.walletAvailable ? `/api/public/cards/${pub.slug}/pass` : null}
      qrSrc={`/api/public/cards/${pub.slug}/qr`}
    />
  );
}
