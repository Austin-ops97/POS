import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Shield } from "lucide-react";

export default async function SecuritySettingsPage() {
  const ctx = await requireAuth();
  const settings = await getBusinessSettings(ctx);

  const security = settings && "requirePinAtRegister" in settings ? settings : null;

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
            <Shield className="h-5 w-5 text-slate-400" />
            Register security
          </CardTitle>
          <CardDescription>Current security settings for your POS</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">PIN required at register</dt>
              <dd className="font-medium">
                {security?.requirePinAtRegister ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Manager PIN for refunds</dt>
              <dd className="font-medium">
                {security?.requireManagerPinRefund ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Manager approval for refunds</dt>
              <dd className="font-medium">
                {security?.requireManagerRefund ? "Yes" : "No"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Session timeout</dt>
              <dd className="font-medium">
                {security?.sessionTimeoutMinutes ?? 30} minutes
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            Authentication is managed through Clerk. Employee PINs are configured per staff
            member.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
