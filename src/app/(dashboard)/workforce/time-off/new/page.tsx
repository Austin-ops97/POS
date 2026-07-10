import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { TimeOffForm } from "@/components/workforce/time-off-form";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";

export default async function NewTimeOffPage() {
  const ctx = await requireAuth();

  const employee = await db.employeeProfile.findUnique({
    where: { id: ctx.employee.id },
    select: { ptoBalanceHours: true },
  });

  const ptoBalance = Number(employee?.ptoBalanceHours ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/workforce/time-off">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Request Time Off</h1>
          <p className="text-sm text-slate-500">Submit a new time off request</p>
        </div>
      </div>
      <TimeOffForm ptoBalance={ptoBalance} />
    </div>
  );
}
