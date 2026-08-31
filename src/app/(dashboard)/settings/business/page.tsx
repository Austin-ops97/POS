import Link from "next/link";
import { requireAuth, canManageBusinessProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BusinessProfileForm } from "@/components/dashboard/business-profile-form";
import { ChevronLeft, Building2 } from "lucide-react";

export default async function BusinessSettingsPage() {
  const ctx = await requireAuth();
  const biz = ctx.business;
  const canEdit = canManageBusinessProfile(ctx);

  const initial = {
    name: biz.name,
    legalName: biz.legalName ?? "",
    type: biz.type,
    phone: biz.phone ?? "",
    email: biz.email ?? "",
    website: biz.website ?? "",
    primaryColor: biz.primaryColor ?? "#1e3a5f",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Settings
          </Button>
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Business</h1>
        <p className="text-sm text-slate-500">Your company profile and branding</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Business profile
          </CardTitle>
          <CardDescription>
            {canEdit
              ? "Update your company name, contact details, and branding."
              : "View-only — contact an owner or admin to make changes."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm initial={initial} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
