type PresentCard = {
  last4?: string | null;
  brand?: string | null;
};

/** Typed-card and Terminal card_present charges store last4 on different objects. */
export function readChargeCardDetails(
  details:
    | {
        card?: PresentCard | null;
        card_present?: PresentCard | null;
        interac_present?: PresentCard | null;
      }
    | null
    | undefined
): { cardLast4?: string; cardBrand?: string } {
  const card = details?.card_present ?? details?.interac_present ?? details?.card;
  return {
    cardLast4: card?.last4 ?? undefined,
    cardBrand: card?.brand ?? undefined,
  };
}
