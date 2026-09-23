"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IdCard, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PrivateCardDto } from "@/lib/office/digital-cards/service";

export function CardLibrary({ cards, canCreate }: { cards: PrivateCardDto[]; canCreate: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function createCard() {
    setCreating(true);
    try {
      const response = await fetch("/api/office/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error || "Could not create a card");
      router.push(`/office/cards/${body.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a card");
      setCreating(false);
    }
  }

  async function unpublish(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/office/cards/${id}/unpublish`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Could not unpublish");
      toast.success("Card unpublished");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unpublish");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Office</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Digital Business Cards</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Design a card, preview it as you edit, then publish a stable link and QR code. Visitors open the page and choose Save to Contacts themselves.
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => void createCard()} disabled={creating}>
            <Plus className="h-4 w-4" />
            {creating ? "Creating…" : "New card"}
          </Button>
        ) : null}
      </div>
      {cards.length ? (
        <ul className="grid gap-3">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: card.theme.accent }}>
                  <IdCard className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{card.personName}</p>
                  <p className="truncate text-sm text-slate-500">
                    {card.businessName}
                    {card.jobTitle ? ` · ${card.jobTitle}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {card.status === "PUBLISHED" ? "Published" : card.status === "UNPUBLISHED" ? "Unpublished" : "Draft"}
                </Badge>
                {card.canEdit ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/office/cards/${card.id}`}>Edit</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/office/cards/${card.id}`}>View</Link>
                  </Button>
                )}
                {card.status === "PUBLISHED" && card.publicPath ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={card.publicPath} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </Button>
                ) : null}
                {card.canEdit && card.status === "PUBLISHED" ? (
                  <Button size="sm" variant="ghost" disabled={busyId === card.id} onClick={() => void unpublish(card.id)}>
                    Unpublish
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <IdCard className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-900">No cards yet</p>
          <p className="mt-1 text-sm text-slate-500">Create one to share a phone number, email, and social links.</p>
        </div>
      )}
    </div>
  );
}
