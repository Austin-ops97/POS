"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegisterPinLockProps = {
  onUnlocked: (employee: { id: string; name: string }) => void;
};

export function RegisterPinLock({ onUnlocked }: RegisterPinLockProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    if (value.length !== 4) {
      setError("Enter a 4-digit PIN");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/register/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Invalid PIN");
        setPin("");
        return;
      }
      onUnlocked({ id: data.employeeId, name: data.employeeName });
      setPin("");
    } catch {
      setError("Unable to unlock register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/90 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">Unlock register</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter your employee PIN to start or continue sales.
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(pin);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="register-pin">4-digit PIN</Label>
            <Input
              id="register-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(next);
                if (next.length === 4) void submit(next);
              }}
              className="h-14 text-center text-2xl tracking-[0.4em]"
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading || pin.length !== 4}>
            {loading ? "Checking…" : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
