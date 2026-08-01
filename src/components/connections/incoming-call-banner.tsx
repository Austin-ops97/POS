"use client";

import { Button } from "@/components/ui/button";

export type IncomingCallInfo = {
  id: string;
  type: "AUDIO" | "VIDEO";
  startedByName: string;
  conversationName?: string | null;
};

export type IncomingCallBannerProps = {
  call: IncomingCallInfo;
  onAnswer: (withVideo: boolean) => void;
  onDecline: () => void;
  busy?: boolean;
};

export function IncomingCallBanner({ call, onAnswer, onDecline, busy }: IncomingCallBannerProps) {
  const label = call.type === "AUDIO" ? "Incoming audio call" : "Incoming video call";
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center p-3"
      role="alertdialog"
      aria-label={label}
    >
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-sm text-slate-600">
            {call.startedByName}
            {call.conversationName ? ` · ${call.conversationName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => onAnswer(true)}>
            Answer
          </Button>
          {call.type === "VIDEO" ? (
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onAnswer(false)}>
              Answer without video
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDecline}>
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
