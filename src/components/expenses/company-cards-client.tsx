"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type CardRow = {
  id: string;
  name: string;
  lastFour: string;
  bank: string | null;
  cardType: string;
  status: string;
  monthlyLimit: unknown;
  dailyLimit: unknown;
  assignedEmployee: { id: string; name: string } | null;
  notes: string | null;
};

export function CompanyCardsClient({
  cards,
  employees,
  canManage,
}: {
  cards: CardRow[];
  employees: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    lastFour: "",
    bank: "",
    cardType: "CREDIT",
    assignedEmployeeId: "",
    monthlyLimit: "",
    dailyLimit: "",
    notes: "",
  });

  function createCard() {
    startTransition(async () => {
      const res = await fetch("/api/expenses/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          lastFour: form.lastFour,
          bank: form.bank || null,
          cardType: form.cardType,
          assignedEmployeeId: form.assignedEmployeeId || null,
          monthlyLimit: form.monthlyLimit ? Number(form.monthlyLimit) : null,
          dailyLimit: form.dailyLimit ? Number(form.dailyLimit) : null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not create card");
        return;
      }
      toast.success("Company card added");
      setForm({
        name: "",
        lastFour: "",
        bank: "",
        cardType: "CREDIT",
        assignedEmployeeId: "",
        monthlyLimit: "",
        dailyLimit: "",
        notes: "",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Finance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Company Cards</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track cards by last four digits only — never store full card numbers.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.id} href={`/finance/cards/${card.id}`}>
            <Card className="h-full rounded-2xl transition hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{card.name}</span>
                  <span className="font-mono text-slate-500">····{card.lastFour}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-slate-600">
                <p>{card.bank || "Bank not set"} · {card.cardType}</p>
                <p>Assigned: {card.assignedEmployee?.name ?? "Unassigned"}</p>
                <p>
                  Monthly limit:{" "}
                  {card.monthlyLimit != null ? formatCurrency(Number(card.monthlyLimit)) : "—"}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate-400">{card.status}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {canManage ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Add company card</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Card name</Label>
              <Input
                className="mt-1.5 h-11 rounded-xl"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Last four</Label>
              <Input
                className="mt-1.5 h-11 rounded-xl"
                maxLength={4}
                inputMode="numeric"
                value={form.lastFour}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lastFour: e.target.value.replace(/\D/g, "").slice(0, 4) }))
                }
              />
            </div>
            <div>
              <Label>Bank</Label>
              <Input
                className="mt-1.5 h-11 rounded-xl"
                value={form.bank}
                onChange={(e) => setForm((f) => ({ ...f, bank: e.target.value }))}
              />
            </div>
            <div>
              <Label>Card type</Label>
              <Select
                value={form.cardType}
                onValueChange={(v) => setForm((f) => ({ ...f, cardType: v }))}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CREDIT">Credit</SelectItem>
                  <SelectItem value="DEBIT">Debit</SelectItem>
                  <SelectItem value="VIRTUAL">Virtual</SelectItem>
                  <SelectItem value="CHARGE">Charge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned employee</Label>
              <Select
                value={form.assignedEmployeeId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, assignedEmployeeId: v }))}
              >
                <SelectTrigger className="mt-1.5 h-11 rounded-xl">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monthly limit</Label>
              <Input
                type="number"
                className="mt-1.5 h-11 rounded-xl"
                value={form.monthlyLimit}
                onChange={(e) => setForm((f) => ({ ...f, monthlyLimit: e.target.value }))}
              />
            </div>
            <div>
              <Label>Daily limit</Label>
              <Input
                type="number"
                className="mt-1.5 h-11 rounded-xl"
                value={form.dailyLimit}
                onChange={(e) => setForm((f) => ({ ...f, dailyLimit: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Input
                className="mt-1.5 h-11 rounded-xl"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Button className="min-h-11 rounded-xl" disabled={pending} onClick={createCard}>
                Create card
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
