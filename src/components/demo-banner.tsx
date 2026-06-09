import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-3 bg-slate-900 px-4 py-2 text-sm text-white">
      <Sparkles className="h-4 w-4 text-amber-400" />
      <span>
        <strong>Demo Mode</strong> — exploring with sample data. Payments and auth are simulated.
      </span>
      <Link href="/register">
        <Button size="sm" variant="secondary" className="h-7 text-xs">
          Try Register
        </Button>
      </Link>
      <Link href="/dashboard">
        <Button size="sm" variant="secondary" className="h-7 text-xs">
          View Dashboard
        </Button>
      </Link>
    </div>
  );
}
