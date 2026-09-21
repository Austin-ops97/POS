import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { ScheduleAssist } from "@/components/workforce/schedule-assist";

export const metadata = { title: "Schedule suggestions" };

export default async function ScheduleAssistPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.MANAGE_WORKFORCE)) redirect("/workforce/schedule");
  const locations = await db.location.findMany({
    where: { businessId: ctx.business.id, deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce/schedule">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule suggestions</h1>
          <p className="text-sm text-slate-500">Review cost and warnings, then publish onto the existing schedule</p>
        </div>
      </div>
      <ScheduleAssist locations={locations} />
    </div>
  );
}
