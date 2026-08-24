import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { TimeClockKiosk } from "@/components/workforce/time-clock-kiosk";
import { Button } from "@/components/ui/button";

export default async function TimeClockPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <Link href="/workforce" className="shrink-0">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Time Clock</h1>
          <p className="text-sm text-slate-500">
            Enter a PIN to punch in, take a break, or clock out
          </p>
        </div>
      </div>
      <TimeClockKiosk />
    </div>
  );
}
