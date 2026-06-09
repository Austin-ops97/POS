import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ModulesSettings } from "@/components/dashboard/modules-settings";

export default async function ModulesSettingsPage() {
  const ctx = await requireAuth();

  const moduleSettings = await db.moduleSetting.findMany({
    where: { businessId: ctx.business.id },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Modules</h1>
          <p className="text-sm text-slate-500">
            Enable or disable industry-specific features
          </p>
        </div>
      </div>
      <ModulesSettings
        settings={moduleSettings.map((s) => ({
          module: s.module,
          enabled: s.enabled,
        }))}
      />
    </div>
  );
}
