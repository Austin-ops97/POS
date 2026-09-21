import { Suspense } from "react";
import { requirePlatformAdmin } from "@/lib/auth";
import { builderUnlockMatchesUser } from "@/lib/builder/gate";
import { isBuilderUnlockConfigured } from "@/lib/builder/unlock-token";
import { BuilderConsole } from "@/components/admin/builder-console";
import { BuilderUnlock } from "@/components/admin/builder-unlock";

export const dynamic = "force-dynamic";

export default async function BuilderPage() {
  const user = await requirePlatformAdmin();
  const configured = isBuilderUnlockConfigured();
  const unlocked = configured && (await builderUnlockMatchesUser(user.id));
  if (!unlocked) return <BuilderUnlock configured={configured} />;
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading builder…</p>}>
      <BuilderConsole />
    </Suspense>
  );
}
