import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getModuleSettings } from "@/lib/queries";
import { ModulesSettings } from "@/components/dashboard/modules-settings";
import { Button } from "@/components/ui/button";

export default async function ModulesSettingsPage() {
  const ctx = await requireAuth();
  const modules = await getModuleSettings(ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Industry Modules</h1>
          <p className="text-sm text-slate-500">Enable features for your business type</p>
        </div>
      </div>
      <ModulesSettings settings={modules} />
    </div>
  );
}
