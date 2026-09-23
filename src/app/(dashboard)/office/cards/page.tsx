import { redirect } from "next/navigation";
import { hasPermission, requireAuth } from "@/lib/auth";
import { CardLibrary } from "@/components/office/cards/card-library";
import { PERMISSIONS } from "@/lib/permissions";
import { listDigitalCards } from "@/lib/office/digital-cards/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "Digital Business Cards" };

export default async function DigitalCardsPage() {
  const ctx = await requireAuth();
  if (
    !hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS) &&
    !hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS) &&
    !hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS)
  ) {
    redirect("/office");
  }
  const cards = await listDigitalCards(ctx);
  return (
    <CardLibrary
      cards={cards}
      canCreate={
        hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS) ||
        hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS)
      }
    />
  );
}
