import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/queries";
import { DEFAULT_DISPLAY_TIMEZONE } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegionalSettingsForm } from "@/components/dashboard/regional-settings-form";
import { ChevronLeft, Globe } from "lucide-react";

export default async function RegionalSettingsPage() {
  const ctx = await requireAuth();
  const settings = await getBusinessSettings(ctx);

  const initial = {
    displayTimezone:
      settings?.displayTimezone ??
      ctx.location?.timezone ??
      DEFAULT_DISPLAY_TIMEZONE,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Settings
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Regional</h1>
        <p className="text-sm text-slate-500">Timezone and locale preferences</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Timezone
          </CardTitle>
          <CardDescription>
            Choose how dates and times are displayed for everyone in your business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegionalSettingsForm initial={initial} />
        </CardContent>
      </Card>
    </div>
  );
}
