import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CUSTOMER_CONFIGURABLE_MODULES } from "@/lib/modules";
import { getBusinessModuleAccess } from "@/lib/access-control";

export default async function ModulesSettingsPage() {
  const ctx = await requireAuth();
  const access = await getBusinessModuleAccess(ctx.business.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Licensed Modules</h1>
          <p className="text-sm text-slate-500">Your platform administrator controls the modules included in your plan.</p>
        </div>
      </div>
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        {CUSTOMER_CONFIGURABLE_MODULES.map(({ key, name, description }) => (
          <Card key={key} className={!access[key] ? "opacity-60" : undefined}>
            <CardHeader><CardTitle className="flex justify-between text-base"><span>{name}</span><span className="text-xs">{access[key] ? "Enabled" : "Not included"}</span></CardTitle><CardDescription>{description}</CardDescription></CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
