"use client";

import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ClockState = "OFF_CLOCK" | "ON_CLOCK" | "ON_BREAK";

function formatStamp(iso: string | Date) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DashboardClockToggle() {
  const [clockState, setClockState] = useState<ClockState | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/workforce/time-clock");
    const body = await res.json().catch(() => null);
    if (res.ok) setClockState(body.clockState as ClockState);
  }

  useEffect(() => {
    void load();
  }, []);

  async function punch() {
    if (!clockState || clockState === "ON_BREAK") return;
    const action = clockState === "OFF_CLOCK" ? "CLOCK_IN" : "CLOCK_OUT";
    setBusy(true);
    try {
      const res = await fetch("/api/workforce/time-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not update clock");
      setClockState(body.clockState as ClockState);
      const at = body.clockedInAt ? formatStamp(body.clockedInAt) : formatStamp(new Date());
      toast.success(action === "CLOCK_IN" ? `Clocked in at ${at}` : `Clocked out at ${formatStamp(new Date())}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update clock");
    } finally {
      setBusy(false);
    }
  }

  if (!clockState) return null;
  if (clockState === "ON_BREAK") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        On break — end it from Workforce before clocking out.
      </div>
    );
  }

  const clockedIn = clockState === "ON_CLOCK";
  return (
    <Button
      type="button"
      size="lg"
      className={clockedIn ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
      onClick={() => void punch()}
      disabled={busy}
    >
      {clockedIn ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
      {busy ? "Updating…" : clockedIn ? "Clock out" : "Clock in"}
      <Clock className="h-4 w-4 opacity-70" />
    </Button>
  );
}
