import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SecuritySettingsForm } from "@/components/dashboard/security-settings-form";
import { ChevronLeft, Shield } from "lucide-react";

export default async function SecuritySettingsPage() {
  const ctx = await requireAuth();
  const settings = await getBusinessSettings(ctx);

  const initial = {
    requirePinAtRegister: settings?.requirePinAtRegister ?? false,
    requireManagerPinRefund: settings?.requireManagerPinRefund ?? true,
    requireManagerRefund: settings?.requireManagerRefund ?? true,
    sessionTimeoutMinutes: settings?.sessionTimeoutMinutes ?? 30,
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
        <h1 className="text-2xl font-bold text-slate-900">Security</h1>
        <p className="text-sm text-slate-500">Access controls and register policies</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Register security
          </CardTitle>
          <CardDescription>
            Configure PIN unlock and refund approval policies for your POS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecuritySettingsForm initial={initial} />
        </CardContent>
      </Card>
    </div>
  );
}
