"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

type RegisterSessionSummary = {
  id: string;
  status: string;
  openingCash: number;
  cashSales: number;
  cashRefunds: number;
  paidIn: number;
  paidOut: number;
  expectedCash: number;
};

type CashDrawerControlsProps = {
  locationId: string | null;
  unlocked: boolean;
};

export function CashDrawerControls({ locationId, unlocked }: CashDrawerControlsProps) {
  const [session, setSession] = useState<RegisterSessionSummary | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [actualCash, setActualCash] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!locationId || !unlocked) {
      setSession(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/register/session?locationId=${encodeURIComponent(locationId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setSession(data.session ?? null);
    } catch {
      // ignore transient errors
    }
  }, [locationId, unlocked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openSession() {
    if (!locationId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/register/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open",
          locationId,
          openingCash: Number(openingCash) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Unable to open cash drawer");
        return;
      }
      setSession(data.session);
      setOpenDialog(false);
      toast.success("Cash drawer opened");
    } finally {
      setLoading(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch("/api/register/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          sessionId: session.id,
          actualCash: Number(actualCash) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Unable to close cash drawer");
        return;
      }
      setSession(null);
      setCloseDialog(false);
      setActualCash("");
      const overShort = data.session?.overShort ?? 0;
      toast.success(
        overShort === 0
          ? "Cash drawer closed — balanced"
          : `Cash drawer closed — ${overShort > 0 ? "over" : "short"} ${formatCurrency(Math.abs(overShort))}`
      );
    } finally {
      setLoading(false);
    }
  }

  if (!unlocked || !locationId) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {session ? (
          <>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Drawer {formatCurrency(session.expectedCash)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setActualCash(String(session.expectedCash));
                setCloseDialog(true);
              }}
            >
              <Banknote className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Close drawer
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpenDialog(true)}
          >
            <Banknote className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Open drawer
          </Button>
        )}
      </div>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open cash drawer</DialogTitle>
            <DialogDescription>
              Enter the opening float before taking cash sales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="opening-cash">Opening cash</Label>
              <Input
                id="opening-cash"
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={loading} onClick={() => void openSession()}>
              {loading ? "Opening…" : "Open session"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close cash drawer</DialogTitle>
            <DialogDescription>
              Expected on hand: {session ? formatCurrency(session.expectedCash) : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="actual-cash">Counted cash</Label>
              <Input
                id="actual-cash"
                type="number"
                min="0"
                step="0.01"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={loading} onClick={() => void closeSession()}>
              {loading ? "Closing…" : "Close session"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
