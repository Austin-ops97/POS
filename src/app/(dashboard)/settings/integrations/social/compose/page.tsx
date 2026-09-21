import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SocialComposer } from "@/components/settings/social-composer";
import { canManageSocial } from "@/lib/social/access";
import { socialOverview } from "@/lib/social/social-service";

export const metadata = { title: "Create social post" };

export default async function SocialComposePage() {
  const ctx = await requireAuth();
  if (!canManageSocial(ctx)) redirect("/settings");
  const overview = await socialOverview(ctx);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/settings/integrations/social">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Social media
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create social post</h1>
        <p className="text-sm text-slate-500">One draft can go to every connected Facebook Page, Instagram account, and LinkedIn profile or organization you select.</p>
      </div>
      <SocialComposer accounts={overview.accounts} />
    </div>
  );
}
