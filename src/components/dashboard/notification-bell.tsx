"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type Preferences = {
  emailRemindersEnabled: boolean;
  inAppRemindersEnabled: boolean;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    emailRemindersEnabled: true,
    inAppRemindersEnabled: true,
  });

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      if (data.preferences) setPreferences(data.preferences);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, []);

  const unread = items.filter((item) => !item.readAt).length;

  async function markRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markRead: true }),
    }).catch(() => null);
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
  }

  async function updatePreference(next: Partial<Preferences>) {
    const merged = { ...preferences, ...next };
    setPreferences(merged);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        onClick={() => {
          setOpen((value) => !value);
          if (!open && unread) void markRead();
        }}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          <div className="mt-3 space-y-2 border-b border-slate-100 pb-3">
            <label className="flex items-center justify-between gap-3 text-xs text-slate-600">
              <span>Email project reminders</span>
              <Switch
                checked={preferences.emailRemindersEnabled}
                onCheckedChange={(checked) => void updatePreference({ emailRemindersEnabled: checked })}
                aria-label="Email project reminders"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-slate-600">
              <span>In-app project reminders</span>
              <Switch
                checked={preferences.inAppRemindersEnabled}
                onCheckedChange={(checked) => void updatePreference({ inAppRemindersEnabled: checked })}
                aria-label="In-app project reminders"
              />
            </label>
          </div>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-slate-500">No notifications yet</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-lg bg-slate-50 p-2">
                  {item.href ? (
                    <Link href={item.href} className="text-sm font-medium text-slate-900 hover:underline" onClick={() => setOpen(false)}>
                      {item.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  )}
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}


