import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { TimeClockKiosk } from "@/components/workforce/time-clock-kiosk";
import { Button } from "@/components/ui/button";

export default async function TimeClockPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Time Clock</h1>
          <p className="text-sm text-slate-500">
            Employees enter their PIN to punch in, take breaks, and clock out
          </p>
        </div>
      </div>
      <TimeClockKiosk />
    </div>
  );
}
