import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { RemindersManager } from "@/components/office/apps/reminders-manager";

export default async function OfficeRemindersPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.MANAGE_PROJECT_REMINDERS)) {
    redirect("/office");
  }
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <RemindersManager />
    </div>
  );
}
