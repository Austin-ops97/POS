"use client";

import { Button } from "@/components/ui/button";

export type ActiveCallJoinInfo = {
  id: string;
  type: "AUDIO" | "VIDEO";
  startedByName: string;
  conversationName?: string | null;
  status: string;
};

export type ActiveCallJoinBarProps = {
  call: ActiveCallJoinInfo;
  onJoin: (withVideo: boolean) => void;
  busy?: boolean;
};

export function ActiveCallJoinBar({ call, onJoin, busy }: ActiveCallJoinBarProps) {
  const isVideo = call.type === "VIDEO";
  const label = isVideo ? "Video call active" : "Audio call active";

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center p-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
            aria-hidden
          />
          <div>
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            <p className="text-sm text-slate-600">
              {call.startedByName}
              {call.conversationName ? ` · ${call.conversationName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => onJoin(isVideo)}>
            Join call
          </Button>
          {isVideo ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onJoin(false)}
            >
              Join without video
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
