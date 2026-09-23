import type { ReactNode } from "react";
import { Globe, Mail, MapPin, Phone, QrCode, UserRound } from "lucide-react";
// Palette lives in theme.ts so this client component never imports access.ts (node:crypto).
import { cardPalette } from "@/lib/office/digital-cards/theme";
import { mapsUrl, socialDisplayLabel, telHref, websiteLabel } from "@/lib/office/digital-cards/links";
import type { SocialNetwork } from "@/lib/validations/digital-cards";
import { SocialBrandIcon } from "./social-brand-icons";

export type GlassCardPhone = { label: string; number: string; visible: boolean };
export type GlassCardAddress = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  visible: boolean;
};
export type GlassCardSocial = {
  network: SocialNetwork;
  label: string;
  url: string;
  visible: boolean;
};

export type GlassCardData = {
  businessName: string;
  personName: string;
  jobTitle: string;
  email: string;
  website: string;
  note: string;
  logoUrl: string | null;
  theme: { accent: string; gradientFrom: string; gradientTo: string };
  phones: GlassCardPhone[];
  addresses: GlassCardAddress[];
  socialLinks: GlassCardSocial[];
};

type Props = {
  card: GlassCardData;
  mode: "preview" | "public";
  layout?: "frame" | "page";
  saveHref?: string | null;
  walletHref?: string | null;
  qrSrc?: string | null;
};

function ActionRow({
  href,
  icon,
  eyebrow,
  label,
  muted,
}: {
  href?: string;
  icon: ReactNode;
  eyebrow: string;
  label: string;
  muted: string;
}) {
  const className =
    "flex min-h-12 w-full min-w-0 max-w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-left transition duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
  const body = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: muted }}>
          {eyebrow}
        </span>
        <span className="block break-words text-sm font-semibold [overflow-wrap:anywhere]">{label}</span>
      </span>
    </>
  );
  if (!href) {
    return <div className={className}>{body}</div>;
  }
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {body}
    </a>
  );
}

export function GlassBusinessCard({ card, mode, layout = "frame", saveHref, walletHref, qrSrc }: Props) {
  const palette = cardPalette(card.theme);
  const phones = mode === "public" ? card.phones.filter((item) => item.visible && item.number) : card.phones.filter((item) => item.number);
  const addresses = mode === "public" ? card.addresses.filter((item) => item.visible && item.line1) : card.addresses.filter((item) => item.line1);
  const socials = mode === "public" ? card.socialLinks.filter((item) => item.visible && item.url) : card.socialLinks.filter((item) => item.url);
  const interactive = mode === "public";

  return (
    <div
      className={
        layout === "page"
          ? "card-rise relative isolate box-border h-dvh max-h-dvh w-full min-w-0 max-w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain"
          : "card-rise relative isolate box-border w-full min-w-0 max-w-full overflow-x-clip rounded-[2rem] shadow-[0_30px_80px_-36px_rgba(0,0,0,0.65)]"
      }
      style={{ background: palette.gradient, color: palette.ink }}
    >
      <div className="relative min-h-full w-full overflow-hidden">
      <div className="pointer-events-none absolute -left-8 top-8 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
      <div
        className="pointer-events-none absolute -right-0 bottom-6 h-48 w-48 rounded-full opacity-50 blur-3xl"
        style={{ background: palette.accent }}
      />
      <div className={layout === "page" ? "relative mx-auto w-full min-w-0 max-w-lg px-4 py-8 pb-16 sm:px-6 sm:py-12" : "relative w-full min-w-0 px-4 py-5 sm:px-6 sm:py-7"}>
        <article
          className="w-full min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-2xl sm:p-6"
          style={{ background: palette.panel, borderColor: palette.border }}
        >
          <div className="flex w-full min-w-0 items-start gap-4">
            {card.logoUrl ? (
              // Tenant logos are dynamic blob or card URLs, so they are not passed through the image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.logoUrl}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover shadow-lg ring-1 ring-white/40"
              />
            ) : (
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-semibold shadow-lg"
                style={{ background: palette.accent, color: palette.accentInk }}
              >
                {(card.businessName || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words text-[11px] font-semibold uppercase tracking-[0.14em] [overflow-wrap:anywhere]" style={{ color: palette.muted }}>
                {card.businessName || "Business"}
              </p>
              <h1 className="mt-1 break-words text-2xl font-semibold leading-tight tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-3xl">
                {card.personName || "Your name"}
              </h1>
              {card.jobTitle ? (
                <p className="mt-1 break-words text-sm font-medium [overflow-wrap:anywhere]" style={{ color: palette.muted }}>
                  {card.jobTitle}
                </p>
              ) : null}
            </div>
          </div>
          {card.note ? (
            <p className="mt-5 break-words text-sm leading-6 [overflow-wrap:anywhere]" style={{ color: palette.muted }}>
              {card.note}
            </p>
          ) : null}
          <div className="mt-5 space-y-2">
            {phones.map((phone) => (
              <div key={`${phone.label}-${phone.number}`} className={phone.visible ? "" : "opacity-45"}>
                <ActionRow
                  href={interactive ? telHref(phone.number) : undefined}
                  icon={<Phone className="h-4 w-4" />}
                  eyebrow={phone.label || "Phone"}
                  label={phone.number}
                  muted={palette.muted}
                />
              </div>
            ))}
            {card.email ? (
              <ActionRow
                href={interactive ? `mailto:${card.email}` : undefined}
                icon={<Mail className="h-4 w-4" />}
                eyebrow="Email"
                label={card.email}
                muted={palette.muted}
              />
            ) : null}
            {card.website ? (
              <ActionRow
                href={interactive ? card.website : undefined}
                icon={<Globe className="h-4 w-4" />}
                eyebrow="Website"
                label={websiteLabel(card.website)}
                muted={palette.muted}
              />
            ) : null}
            {addresses.map((address) => (
              <div key={`${address.line1}-${address.city}`} className={address.visible ? "" : "opacity-45"}>
                <ActionRow
                  href={interactive ? mapsUrl(address) : undefined}
                  icon={<MapPin className="h-4 w-4" />}
                  eyebrow={address.label || "Address"}
                  label={[address.line1, address.city].filter(Boolean).join(", ")}
                  muted={palette.muted}
                />
              </div>
            ))}
          </div>
          {socials.length ? (
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {socials.map((link) => {
                const className =
                  "flex min-h-12 w-full min-w-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
                const body = (
                  <>
                    <SocialBrandIcon network={link.network} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{socialDisplayLabel(link.network, link.label)}</span>
                  </>
                );
                return (
                  <li key={`${link.network}-${link.url}`} className={`min-w-0 ${link.visible ? "" : "opacity-45"}`}>
                    {interactive ? (
                      <a href={link.url} target="_blank" rel="noreferrer" className={className}>
                        {body}
                      </a>
                    ) : (
                      <div className={className}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="mt-5 space-y-3">
            {saveHref ? (
              <a
                href={saveHref}
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold shadow-lg transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ background: palette.accent, color: palette.accentInk }}
              >
                <UserRound className="h-4 w-4" />
                Save to Contacts
              </a>
            ) : (
              <div
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold shadow-lg"
                style={{ background: palette.accent, color: palette.accentInk }}
              >
                <UserRound className="h-4 w-4" />
                Save to Contacts
              </div>
            )}
            {walletHref ? (
              <a
                href={walletHref}
                className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-black px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Add to Apple Wallet
              </a>
            ) : (
              <div className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-black px-4 text-sm font-semibold text-white shadow-lg">
                Add to Apple Wallet
              </div>
            )}
          </div>
          {qrSrc ? (
            <div className="mt-5 flex w-full min-w-0 max-w-full flex-col items-center gap-2 rounded-2xl bg-white p-3 text-slate-900">
              {/* QR images are generated per card and should not be rewritten by the optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="QR code that opens this card" className="h-36 w-36" />
              <p className="flex items-center gap-1 text-center text-xs font-medium text-slate-600">
                <QrCode className="h-3.5 w-3.5" />
                Scanning opens this page. Save the contact when you are ready.
              </p>
            </div>
          ) : null}
        </article>
      </div>
      </div>
    </div>
  );
}
