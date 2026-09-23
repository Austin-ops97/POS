import { notFound, redirect } from "next/navigation";
import { hasPermission, requireAuth } from "@/lib/auth";
import { CardBuilder } from "@/components/office/cards/card-builder";
import { PERMISSIONS } from "@/lib/permissions";
import { getDigitalCard } from "@/lib/office/digital-cards/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const ctx = await requireAuth();
  const card = await getDigitalCard(ctx, id);
  return { title: card ? `${card.personName} · Digital card` : "Digital card" };
}

export default async function DigitalCardEditorPage({ params }: Params) {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS) &&
    !hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS) &&
    !hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS)
  ) {
    redirect("/office");
  }
  const { id } = await params;
  const card = await getDigitalCard(ctx, id);
  if (!card) notFound();
  return <CardBuilder initial={card} />;
}
