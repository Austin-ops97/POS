"use client";

import { Switch } from "@/components/ui/switch";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MODULES = [
  { key: "RETAIL", name: "Retail", description: "Physical product sales and inventory" },
  { key: "SERVICE", name: "Services", description: "Bookable services and appointments" },
  { key: "RENTAL", name: "Rentals", description: "Item rentals and returns" },
  { key: "RESTAURANT", name: "Restaurant", description: "Table service, modifiers, and kitchen" },
  { key: "LOYALTY", name: "Loyalty", description: "Points and rewards programs" },
  { key: "GIFT_CARDS", name: "Gift Cards", description: "Sell and redeem gift cards" },
];

type ModuleSetting = { module: string; enabled: boolean };

export function ModulesSettings({ settings }: { settings: ModuleSetting[] }) {
  const enabledMap = new Map(settings.map((s) => [s.module, s.enabled]));

  return (
    <div className="max-w-2xl space-y-4">
      {MODULES.map((mod) => {
        const enabled = enabledMap.get(mod.key) ?? false;
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
                  onCheckedChange={() => {
                    console.log("Toggle module:", mod.key);
                  }}
                />
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
