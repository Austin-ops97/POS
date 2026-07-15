"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MODULE_SETTING_KEYS,
  moduleSettingsSchema,
} from "@/lib/validations";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MODULES = [
  { key: "RETAIL" as const, name: "Retail", description: "Physical product sales and inventory" },
  {
    key: "EXPENSES" as const,
    name: "Expenses",
    description: "Company cards, reimbursements, receipts, and approvals",
  },
];

const MODULE_ALIASES: Record<string, (typeof MODULE_SETTING_KEYS)[number]> = {
  retail: "RETAIL",
  physical_products: "RETAIL",
  service: "SERVICE",
  services: "SERVICE",
  rental: "RENTAL",
  rentals: "RENTAL",
  restaurant: "RESTAURANT",
  loyalty: "LOYALTY",
  gift_cards: "GIFT_CARDS",
  expenses: "EXPENSES",
  finance: "EXPENSES",
};

function normalizeModuleKey(module: string): (typeof MODULE_SETTING_KEYS)[number] {
  const alias = MODULE_ALIASES[module.toLowerCase()];
  if (alias) return alias;
  const upper = module.toUpperCase();
  if ((MODULE_SETTING_KEYS as readonly string[]).includes(upper)) {
    return upper as (typeof MODULE_SETTING_KEYS)[number];
  }
  return "RETAIL";
}

function buildDefaultModules(settings: Array<{ module: string; enabled: boolean }>) {
  const enabledMap = new Map<string, boolean>();
  for (const setting of settings) {
    enabledMap.set(normalizeModuleKey(setting.module), setting.enabled);
  }

  return MODULES.map((mod) => ({
    module: mod.key,
    enabled:
      mod.key === "RETAIL"
        ? true
        : enabledMap.get(mod.key) ?? false,
  }));
}

type ModuleSettingsFormValues = z.infer<typeof moduleSettingsSchema>;

type ModulesSettingsProps = {
  settings: Array<{ module: string; enabled: boolean }>;
};

export function ModulesSettings({ settings }: ModulesSettingsProps) {
  const router = useRouter();
  const {
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<ModuleSettingsFormValues>({
    resolver: zodResolver(moduleSettingsSchema),
    defaultValues: {
      modules: buildDefaultModules(settings),
    },
  });

  const modules = watch("modules");

  async function onSubmit(data: ModuleSettingsFormValues) {
    try {
      const res = await fetch("/api/business/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(err?.error ?? "Failed to save module settings");
        return;
      }

      toast.success("Module settings saved");
      router.refresh();
    } catch {
      toast.error("Failed to save module settings");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-4">
      {MODULES.map((mod, index) => {
        const enabled = modules[index]?.enabled ?? false;
        const isRetail = mod.key === "RETAIL";

        return (
          <Card key={mod.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">{mod.name}</CardTitle>
                <CardDescription>{mod.description}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={mod.key}
                  checked={enabled}
                  disabled={isRetail || isSubmitting}
                  onCheckedChange={(checked) => {
                    setValue(`modules.${index}.enabled`, checked, {
                      shouldValidate: true,
                    });
                  }}
                />
              </div>
            </CardHeader>
          </Card>
        );
      })}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save Changes"}
      </Button>
      <p className="text-sm text-slate-500">
        Additional verticals (services, rentals, loyalty, gift cards) will appear here when available.
      </p>
    </form>
  );
}
