import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft } from "lucide-react";

export default async function BusinessSettingsPage() {
  const ctx = await requireAuth();
  const biz = ctx.business;

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
          <CardTitle>Business profile</CardTitle>
          <CardDescription>
            Your company profile and branding details.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Business name</Label>
            <Input defaultValue={biz.name} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Legal name</Label>
            <Input defaultValue={biz.legalName ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Input defaultValue={biz.type} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input defaultValue={biz.phone ?? ""} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input defaultValue={biz.email ?? ""} readOnly />
          </div>
          <p className="text-sm text-slate-500 sm:col-span-2">
            Full business editing will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
