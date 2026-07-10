"use client";

import { useState, useCallback, useEffect } from "react";
import { Clock, Coffee, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ClockState = "OFF_CLOCK" | "ON_CLOCK" | "ON_BREAK";

type PunchResponse = {
  employeeName: string;
  action: string;
  clockState: ClockState;
  todayHours: number;
};

const ACTION_CONFIG = {
  CLOCK_IN: { label: "Clock In", icon: LogIn, color: "bg-emerald-600 hover:bg-emerald-700" },
  CLOCK_OUT: { label: "Clock Out", icon: LogOut, color: "bg-red-600 hover:bg-red-700" },
  START_BREAK: { label: "Start Break", icon: Coffee, color: "bg-amber-600 hover:bg-amber-700" },
  END_BREAK: { label: "End Break", icon: Clock, color: "bg-blue-600 hover:bg-blue-700" },
} as const;

function getAvailableActions(state: ClockState): Array<keyof typeof ACTION_CONFIG> {
  if (state === "OFF_CLOCK") return ["CLOCK_IN"];
  if (state === "ON_CLOCK") return ["START_BREAK", "CLOCK_OUT"];
  return ["END_BREAK"];
}

export function TimeClockKiosk() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState<PunchResponse | null>(null);
  const [clockState, setClockState] = useState<ClockState>("OFF_CLOCK");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetKiosk = useCallback(() => {
    setPin("");
    setVerified(null);
    setClockState("OFF_CLOCK");
    setSuccessMessage(null);
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(resetKiosk, 3000);
    return () => clearTimeout(timer);
  }, [successMessage, resetKiosk]);

  function appendDigit(digit: string) {
    if (pin.length < 4) setPin((p) => p + digit);
  }

  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  async function verifyPin() {
    if (pin.length !== 4) {
      toast.error("Enter a 4-digit PIN");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workforce/time-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, action: "LOOKUP" }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Invalid PIN");
        setPin("");
        return;
      }

      setVerified(data);
      setClockState(data.clockState);
    } catch {
      toast.error("Connection error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: keyof typeof ACTION_CONFIG) {
    if (pin.length !== 4) {
      toast.error("Enter PIN first");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workforce/time-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, action }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Action failed");
        return;
      }

      setVerified(data);
      setClockState(data.clockState);
      const config = ACTION_CONFIG[action];
      setSuccessMessage(`${data.employeeName} — ${config.label}`);
      if (data.clockState === "OFF_CLOCK") {
        setTimeout(resetKiosk, 3000);
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setLoading(false);
    }
  }

  if (successMessage) {
    return (
      <Card className="mx-auto max-w-md border-2 border-emerald-200 bg-emerald-50">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-emerald-900">{successMessage}</h2>
          {verified && (
            <p className="mt-2 text-emerald-700">
              Today: {verified.todayHours.toFixed(1)} hours worked
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (verified) {
    const actions = getAvailableActions(clockState);
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="space-y-6 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">{verified.employeeName}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Status:{" "}
              <span className="font-medium text-slate-700">
                {clockState === "OFF_CLOCK"
                  ? "Off Clock"
                  : clockState === "ON_BREAK"
                    ? "On Break"
                    : "Clocked In"}
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Today: {verified.todayHours.toFixed(1)} hours
            </p>
          </div>
          <div className="grid gap-3">
            {actions.map((action) => {
              const config = ACTION_CONFIG[action];
              const Icon = config.icon;
              return (
                <Button
                  key={action}
                  size="lg"
                  className={cn("h-16 text-lg text-white", config.color)}
                  disabled={loading}
                  onClick={() => handleAction(action)}
                >
                  <Icon className="mr-2 h-6 w-6" />
                  {config.label}
                </Button>
              );
            })}
          </div>
          <Button variant="ghost" className="w-full" onClick={resetKiosk}>
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-6 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Time Clock</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your 4-digit PIN</p>
        </div>

        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-slate-300 bg-white"
            >
              {pin.length > i && (
                <div className="h-2 w-2 rounded-full bg-slate-900" />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((key) => (
            <Button
              key={key || "empty"}
              variant={key === "" ? "ghost" : "outline"}
              className="h-16 text-2xl font-semibold"
              disabled={key === "" || loading}
              onClick={() => {
                if (key === "←") backspace();
                else appendDigit(key);
              }}
            >
              {key}
            </Button>
          ))}
        </div>

        <Button
          size="lg"
          className="h-14 w-full text-lg"
          disabled={pin.length !== 4 || loading}
          onClick={verifyPin}
        >
          {loading ? "Verifying..." : "Continue"}
        </Button>
      </CardContent>
    </Card>
  );
}
