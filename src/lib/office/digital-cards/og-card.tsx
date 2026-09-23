import React from "react";
import { ImageResponse } from "next/og";
import { getPublishedDigitalCard } from "./service";
import { cardPalette, normalizeTheme, type CardTheme } from "./theme";

export const CARD_OG_SIZE = { width: 1200, height: 630 };
export const CARD_OG_ALT = "Digital business card";

export function renderCardOgImage(input: {
  businessName: string;
  personName: string;
  jobTitle: string;
  theme: CardTheme;
  logoSrc: string | null;
}) {
  const palette = cardPalette(normalizeTheme(input.theme));
  const monogram = (input.businessName || "?").slice(0, 1).toUpperCase();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: palette.gradient,
          color: palette.ink,
          padding: "64px",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: "36px",
            borderRadius: "40px",
            border: "1px solid rgba(255,255,255,0.45)",
            background: palette.panel,
            padding: "48px",
          }}
        >
          {input.logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={input.logoSrc} alt="" width={128} height={128} style={{ borderRadius: 28, objectFit: "cover" }} />
          ) : (
            <div
              style={{
                display: "flex",
                width: 128,
                height: 128,
                borderRadius: 28,
                alignItems: "center",
                justifyContent: "center",
                background: palette.accent,
                color: palette.accentInk,
                fontSize: 56,
                fontWeight: 700,
              }}
            >
              {monogram}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 24, letterSpacing: 3, textTransform: "uppercase", color: palette.muted }}>
              {input.businessName || "Business"}
            </div>
            <div style={{ marginTop: 8, fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>
              {input.personName || "Digital card"}
            </div>
            {input.jobTitle ? (
              <div style={{ marginTop: 10, fontSize: 28, color: palette.muted }}>{input.jobTitle}</div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    CARD_OG_SIZE
  );
}

function logoSrc(card: { logoUrl: string | null; logoMime: string | null; logoData: Uint8Array | null }) {
  if (card.logoUrl && /^https:\/\//i.test(card.logoUrl)) return card.logoUrl;
  if (card.logoData && card.logoMime && card.logoData.byteLength > 0 && card.logoData.byteLength <= 500_000) {
    return `data:${card.logoMime};base64,${Buffer.from(card.logoData).toString("base64")}`;
  }
  return null;
}

export async function loadCardOgResponse(slug: string) {
  const card = await getPublishedDigitalCard(slug);
  if (!card) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#f8fafc",
            fontSize: 42,
          }}
        >
          Card unavailable
        </div>
      ),
      CARD_OG_SIZE
    );
  }
  return renderCardOgImage({
    businessName: card.businessName,
    personName: card.personName,
    jobTitle: card.jobTitle ?? "",
    theme: normalizeTheme(card.theme),
    logoSrc: logoSrc(card),
  });
}
