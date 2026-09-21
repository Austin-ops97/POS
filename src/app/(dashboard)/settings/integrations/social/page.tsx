import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SocialCenter } from "@/components/settings/social-center";
import { canManageSocial, canPublishSocial, canViewSocial } from "@/lib/social/access";
import { socialOverview } from "@/lib/social/social-service";

export const metadata = { title: "Social media" };

export default async function SocialSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const ctx = await requireAuth();
  if (!canViewSocial(ctx)) redirect("/settings");
  const params = await searchParams;
  const overview = await socialOverview(ctx);
  const notice = params.error ?? (params.connected ? "Social account connected." : null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/settings/integrations">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Integrations
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Social media</h1>
        <p className="text-sm text-slate-500">Facebook, Instagram, and LinkedIn through their official APIs. Tokens stay encrypted on the server.</p>
      </div>
      <SocialCenter {...overview} notice={notice} canConnect={canManageSocial(ctx)} canPublish={canPublishSocial(ctx)} />
    </div>
  );
}
