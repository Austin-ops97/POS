"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PrivateCardDto } from "@/lib/office/digital-cards/service";
import { SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/validations/digital-cards";
import { GlassBusinessCard } from "./glass-card";
import { SocialBrandIcon } from "./social-brand-icons";
import { socialDisplayLabel } from "@/lib/office/digital-cards/links";

type EditorCard = PrivateCardDto;

function snapshot(card: EditorCard) {
  return JSON.stringify({
    businessName: card.businessName,
    personName: card.personName,
    jobTitle: card.jobTitle,
    email: card.email,
    website: card.website,
    note: card.note,
    theme: card.theme,
    phones: card.phones.map(({ label, number, visible }) => ({ label, number, visible })),
    addresses: card.addresses.map(({ label, line1, line2, city, region, postalCode, country, visible }) => ({
      label,
      line1,
      line2,
      city,
      region,
      postalCode,
      country,
      visible,
    })),
    socialLinks: card.socialLinks.map(({ network, label, url, visible }) => ({ network, label, url, visible })),
    logoUrl: card.logoUrl,
  });
}

function payload(card: EditorCard) {
  return {
    businessName: card.businessName,
    personName: card.personName,
    jobTitle: card.jobTitle,
    email: card.email,
    website: card.website,
    note: card.note,
    theme: card.theme,
    phones: card.phones.map(({ label, number, visible }) => ({ label, number, visible })),
    addresses: card.addresses.map(({ label, line1, line2, city, region, postalCode, country, visible }) => ({
      label,
      line1,
      line2,
      city,
      region,
      postalCode,
      country,
      visible,
    })),
    socialLinks: card.socialLinks.map(({ network, label, url, visible }) => ({ network, label, url, visible })),
  };
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Something went wrong. Try again.";
}

export function CardBuilder({ initial }: { initial: EditorCard }) {
  const router = useRouter();
  const [card, setCard] = useState(initial);
  const [saved, setSaved] = useState(() => snapshot(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = snapshot(card) !== saved;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = card.publicPath ? `${origin}${card.publicPath}` : "";

  function patch(partial: Partial<EditorCard>) {
    setCard((current) => ({ ...current, ...partial }));
  }

  async function save(next?: EditorCard) {
    const source = next ?? card;
    setBusy("save");
    try {
      const response = await fetch(`/api/office/cards/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(source)),
      });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as EditorCard;
      setCard(updated);
      setSaved(snapshot(updated));
      toast.success("Card saved");
      return updated;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the card");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    const current = dirty ? await save() : card;
    if (!current) return;
    setBusy("publish");
    try {
      const response = await fetch(`/api/office/cards/${current.id}/publish`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as EditorCard;
      setCard(updated);
      setSaved(snapshot(updated));
      toast.success("Card published. The link and QR stay the same from now on.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish");
    } finally {
      setBusy(null);
    }
  }

  async function unpublish() {
    setBusy("unpublish");
    try {
      const response = await fetch(`/api/office/cards/${card.id}/unpublish`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as EditorCard;
      setCard(updated);
      setSaved(snapshot(updated));
      toast.success("Card unpublished. The same link will work again when you publish.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unpublish");
    } finally {
      setBusy(null);
    }
  }

  async function uploadLogo(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read that image"));
      reader.readAsDataURL(file);
    });
    setBusy("logo");
    try {
      const response = await fetch(`/api/office/cards/${card.id}/logo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as EditorCard;
      setCard(updated);
      setSaved(snapshot(updated));
      toast.success("Logo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the logo");
    } finally {
      setBusy(null);
    }
  }

  async function removeLogo() {
    setBusy("logo");
    try {
      const response = await fetch(`/api/office/cards/${card.id}/logo`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response));
      const updated = (await response.json()) as EditorCard;
      setCard(updated);
      setSaved(snapshot(updated));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the logo");
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  }

  const locked = !card.canEdit;
  const published = card.status === "PUBLISHED";

  return (
    <div className="mx-auto max-w-6xl pb-8">
      <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-end gap-2 border-b border-slate-200 bg-slate-50/95 py-3 backdrop-blur-xl">
        {published ? (
          <Button type="button" variant="outline" disabled={locked || busy !== null} onClick={() => void unpublish()}>
            Unpublish
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={locked || busy !== null || !dirty} onClick={() => void save()}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
        <Button type="button" disabled={locked || busy !== null} onClick={() => void publish()}>
          {busy === "publish" ? "Publishing…" : published ? "Publish changes" : "Publish"}
        </Button>
      </div>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="order-2 space-y-6 lg:order-1">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/office/cards">
              <ArrowLeft className="h-4 w-4" />
              Cards
            </Link>
          </Button>
          <Badge variant="outline">{published ? "Published" : card.status === "UNPUBLISHED" ? "Unpublished" : "Draft"}</Badge>
          {dirty ? <span className="text-xs text-slate-500">Unsaved changes</span> : null}
        </div>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Logo and business</h2>
              <p className="text-sm text-slate-500">Shown at the top of the card and in link previews.</p>
            </div>
            {card.logoUrl ? (
              <Button type="button" variant="outline" size="sm" onClick={removeLogo} disabled={locked || busy !== null}>
                Remove logo
              </Button>
            ) : null}
          </div>
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {busy === "logo" ? "Uploading…" : "Upload PNG, JPEG, or WebP"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={locked || busy !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadLogo(file);
              }}
            />
          </label>
          <Field label="Business name">
            <Input value={card.businessName} disabled={locked} onChange={(event) => patch({ businessName: event.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={card.personName} disabled={locked} onChange={(event) => patch({ personName: event.target.value })} />
            </Field>
            <Field label="Job title">
              <Input value={card.jobTitle} disabled={locked} onChange={(event) => patch({ jobTitle: event.target.value })} />
            </Field>
          </div>
        </section>

        <RepeatSection
          title="Phone numbers"
          action="Add phone"
          disabled={locked || card.phones.length >= 8}
          onAdd={() =>
            patch({
              phones: [...card.phones, { id: crypto.randomUUID(), label: "Mobile", number: "", visible: true }],
            })
          }
        >
          {card.phones.map((phone, index) => (
            <RepeatRow
              key={phone.id}
              index={index}
              total={card.phones.length}
              visible={phone.visible}
              disabled={locked}
              onVisible={(visible) => patch({ phones: card.phones.map((item) => (item.id === phone.id ? { ...item, visible } : item)) })}
              onMove={(direction) => patch({ phones: move(card.phones, index, direction) })}
              onRemove={() => patch({ phones: card.phones.filter((item) => item.id !== phone.id) })}
            >
              <Input
                aria-label="Phone label"
                value={phone.label}
                disabled={locked}
                placeholder="Mobile"
                onChange={(event) =>
                  patch({ phones: card.phones.map((item) => (item.id === phone.id ? { ...item, label: event.target.value } : item)) })
                }
              />
              <Input
                aria-label="Phone number"
                value={phone.number}
                disabled={locked}
                placeholder="(555) 010-1000"
                onChange={(event) =>
                  patch({ phones: card.phones.map((item) => (item.id === phone.id ? { ...item, number: event.target.value } : item)) })
                }
              />
            </RepeatRow>
          ))}
        </RepeatSection>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-950">Contact</h2>
          <Field label="Email">
            <Input type="email" value={card.email} disabled={locked} onChange={(event) => patch({ email: event.target.value })} />
          </Field>
          <Field label="Website">
            <Input value={card.website} disabled={locked} placeholder="https://" onChange={(event) => patch({ website: event.target.value })} />
          </Field>
          <Field label="Short note">
            <Textarea value={card.note} disabled={locked} maxLength={400} onChange={(event) => patch({ note: event.target.value })} />
          </Field>
        </section>

        <RepeatSection
          title="Addresses"
          action="Add address"
          disabled={locked || card.addresses.length >= 4}
          onAdd={() =>
            patch({
              addresses: [
                ...card.addresses,
                { id: crypto.randomUUID(), label: "Office", line1: "", line2: "", city: "", region: "", postalCode: "", country: "", visible: true },
              ],
            })
          }
        >
          {card.addresses.map((address, index) => (
            <RepeatRow
              key={address.id}
              index={index}
              total={card.addresses.length}
              visible={address.visible}
              disabled={locked}
              onVisible={(visible) =>
                patch({ addresses: card.addresses.map((item) => (item.id === address.id ? { ...item, visible } : item)) })
              }
              onMove={(direction) => patch({ addresses: move(card.addresses, index, direction) })}
              onRemove={() => patch({ addresses: card.addresses.filter((item) => item.id !== address.id) })}
            >
              <Input aria-label="Address label" value={address.label} disabled={locked} placeholder="Office" onChange={(event) => updateAddress(patch, card, address.id, { label: event.target.value })} />
              <Input aria-label="Street" value={address.line1} disabled={locked} placeholder="Street" onChange={(event) => updateAddress(patch, card, address.id, { line1: event.target.value })} />
              <Input aria-label="Suite" value={address.line2} disabled={locked} placeholder="Suite" onChange={(event) => updateAddress(patch, card, address.id, { line2: event.target.value })} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label="City" value={address.city} disabled={locked} placeholder="City" onChange={(event) => updateAddress(patch, card, address.id, { city: event.target.value })} />
                <Input aria-label="State" value={address.region} disabled={locked} placeholder="State" onChange={(event) => updateAddress(patch, card, address.id, { region: event.target.value })} />
                <Input aria-label="Postal code" value={address.postalCode} disabled={locked} placeholder="Postal code" onChange={(event) => updateAddress(patch, card, address.id, { postalCode: event.target.value })} />
                <Input aria-label="Country" value={address.country} disabled={locked} placeholder="Country" onChange={(event) => updateAddress(patch, card, address.id, { country: event.target.value })} />
              </div>
            </RepeatRow>
          ))}
        </RepeatSection>

        <RepeatSection
          title="Social links"
          action="Add social link"
          disabled={locked || card.socialLinks.length >= 12}
          onAdd={() =>
            patch({
              socialLinks: [...card.socialLinks, { id: crypto.randomUUID(), network: "INSTAGRAM", label: "", url: "", visible: true }],
            })
          }
        >
          {card.socialLinks.map((link, index) => (
            <RepeatRow
              key={link.id}
              index={index}
              total={card.socialLinks.length}
              visible={link.visible}
              disabled={locked}
              onVisible={(visible) =>
                patch({ socialLinks: card.socialLinks.map((item) => (item.id === link.id ? { ...item, visible } : item)) })
              }
              onMove={(direction) => patch({ socialLinks: move(card.socialLinks, index, direction) })}
              onRemove={() => patch({ socialLinks: card.socialLinks.filter((item) => item.id !== link.id) })}
            >
              <div className="flex items-center gap-2">
                <SocialBrandIcon network={link.network} className="h-4 w-4 text-slate-700" />
                <select
                  aria-label="Social network"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base"
                  value={link.network}
                  disabled={locked}
                  onChange={(event) =>
                    patch({
                      socialLinks: card.socialLinks.map((item) =>
                        item.id === link.id ? { ...item, network: event.target.value as SocialNetwork } : item
                      ),
                    })
                  }
                >
                  {SOCIAL_NETWORKS.map((network) => (
                    <option key={network} value={network}>
                      {socialDisplayLabel(network, "")}
                    </option>
                  ))}
                </select>
              </div>
              {link.network === "CUSTOM" ? (
                <Input
                  aria-label="Link label"
                  value={link.label}
                  disabled={locked}
                  placeholder="Label"
                  onChange={(event) =>
                    patch({ socialLinks: card.socialLinks.map((item) => (item.id === link.id ? { ...item, label: event.target.value } : item)) })
                  }
                />
              ) : null}
              <Input
                aria-label="Social URL"
                value={link.url}
                disabled={locked}
                placeholder="https://"
                onChange={(event) =>
                  patch({ socialLinks: card.socialLinks.map((item) => (item.id === link.id ? { ...item, url: event.target.value } : item)) })
                }
              />
            </RepeatRow>
          ))}
        </RepeatSection>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="text-base font-semibold text-slate-950">Colors</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <ColorField label="Accent" value={card.theme.accent} disabled={locked} onChange={(accent) => patch({ theme: { ...card.theme, accent } })} />
            <ColorField label="Gradient start" value={card.theme.gradientFrom} disabled={locked} onChange={(gradientFrom) => patch({ theme: { ...card.theme, gradientFrom } })} />
            <ColorField label="Gradient end" value={card.theme.gradientTo} disabled={locked} onChange={(gradientTo) => patch({ theme: { ...card.theme, gradientTo } })} />
          </div>
        </section>

        {card.slug ? (
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-semibold text-slate-950">Share</h2>
            <p className="break-all text-sm text-slate-600">{publicUrl}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                <Copy className="h-4 w-4" />
                Copy link
              </Button>
              {published ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={`/api/office/cards/${card.id}/qr?download=1`}>Download QR</a>
                </Button>
              ) : (
                <p className="text-sm text-slate-500">Publish to turn the stable link back on. The QR code will keep this same address.</p>
              )}
            </div>
            {published && card.wallet.ready ? (
              <Button type="button" size="sm" asChild>
                <a href={`/api/office/cards/${card.id}/pass`}>Add to Apple Wallet</a>
              </Button>
            ) : null}
            {published && !card.wallet.ready ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Apple Wallet needs a Pass Type ID certificate.</p>
                <p className="mt-1">The download stays off until these environment variables are set. A broken pass file is not offered.</p>
                <ul className="mt-2 list-disc pl-5">
                  {card.wallet.missing.map((name) => (
                    <li key={name}>
                      <code>{name}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-slate-500">Publish the card to create its short link, QR code, and Wallet pass. Later edits keep that same link.</p>
        )}
      </div>

      <aside className="order-1 lg:sticky lg:top-4 lg:order-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Live preview</p>
        <GlassBusinessCard
          card={card}
          mode="preview"
          qrSrc={published ? `/api/office/cards/${card.id}/qr` : null}
        />
      </aside>
    </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      <span className="mb-1.5 block">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" aria-label={label} value={safe} disabled={disabled} className="h-11 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white" onChange={(event) => onChange(event.target.value)} />
        <Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

function RepeatSection({
  title,
  action,
  disabled,
  onAdd,
  children,
}: {
  title: string;
  action: string;
  disabled: boolean;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onAdd}>
          <Plus className="h-4 w-4" />
          {action}
        </Button>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function RepeatRow({
  index,
  total,
  visible,
  disabled,
  onVisible,
  onMove,
  onRemove,
  children,
}: {
  index: number;
  total: number;
  visible: boolean;
  disabled: boolean;
  onVisible: (visible: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <Switch checked={visible} disabled={disabled} onCheckedChange={onVisible} aria-label={visible ? "Visible on the card" : "Hidden on the card"} />
        <span className="text-xs text-slate-500">{visible ? "Visible" : "Hidden"}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Move up" disabled={disabled || index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Move down" disabled={disabled || index === total - 1} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Remove" disabled={disabled} onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const next = [...items];
  const target = index + direction;
  if (target < 0 || target >= next.length) return items;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function updateAddress(
  patch: (partial: Partial<EditorCard>) => void,
  card: EditorCard,
  id: string,
  partial: Partial<EditorCard["addresses"][number]>
) {
  patch({
    addresses: card.addresses.map((item) => (item.id === id ? { ...item, ...partial } : item)),
  });
}
