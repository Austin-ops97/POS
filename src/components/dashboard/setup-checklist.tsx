"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Package,
  CreditCard,
  Store,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SetupChecklistStatus = {
  hasCustomBusinessName: boolean;
  hasProducts: boolean;
  stripeConnected: boolean;
  hasPaidSale: boolean;
};

type SetupChecklistProps = {
  status: SetupChecklistStatus;
  canSeedDemo: boolean;
};

const STEPS = [
  {
    key: "name" as const,
    title: "Name your business",
    description: "Replace the default name so receipts look right.",
    href: "/settings/business",
    icon: Store,
    done: (s: SetupChecklistStatus) => s.hasCustomBusinessName,
  },
  {
    key: "products" as const,
    title: "Add your first product",
    description: "Build a catalog, or load a demo catalog to explore.",
    href: "/products/new",
    icon: Package,
    done: (s: SetupChecklistStatus) => s.hasProducts,
  },
  {
    key: "stripe" as const,
    title: "Connect Stripe",
    description: "Required for card payments and Terminal.",
    href: "/settings/payments",
    icon: CreditCard,
    done: (s: SetupChecklistStatus) => s.stripeConnected,
  },
  {
    key: "sale" as const,
    title: "Complete a sale",
    description: "Try the register with cash or card.",
    href: "/register",
    icon: ShoppingCart,
    done: (s: SetupChecklistStatus) => s.hasPaidSale,
  },
];

export function SetupChecklist({ status, canSeedDemo }: SetupChecklistProps) {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const completed = STEPS.filter((step) => step.done(status)).length;
  const allDone = completed === STEPS.length;

  if (allDone) return null;

  async function seedDemo() {
    setSeeding(true);
    try {
      const res = await fetch("/api/business/demo-catalog", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load demo catalog");
        return;
      }
      if (data.created) {
        toast.success("Demo catalog added");
      } else {
        toast.message("Products already exist");
      }
      router.refresh();
    } catch {
      toast.error("Failed to load demo catalog");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg">Get set up</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            {completed} of {STEPS.length} complete — finish these to run your first day.
          </p>
        </div>
        {!status.hasProducts && canSeedDemo ? (
          <Button
            type="button"
            variant="outline"
            disabled={seeding}
            onClick={() => void seedDemo()}
            className="shrink-0"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {seeding ? "Loading…" : "Load demo catalog"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {STEPS.map((step) => {
            const done = step.done(status);
            const Icon = step.icon;
            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  {done ? (
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 h-5 w-5 shrink-0 text-slate-300"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      {step.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {step.description}
                    </span>
                  </span>
                  <span className="sr-only">{done ? "Completed" : "Incomplete"}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
