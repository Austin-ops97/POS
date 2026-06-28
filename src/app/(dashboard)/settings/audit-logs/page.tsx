import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";

export default async function AuditLogsPage() {
  const ctx = await requireAuth();

  const logs = await db.auditLog.findMany({
    where: { businessId: ctx.business.id },
    include: { employee: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <Link href="/settings">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Settings
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
        <p className="text-sm text-slate-500">Recent activity across your business</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 50 events</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">No audit events recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">
                      {log.action} · {log.entity}
                    </p>
                    <p className="text-xs text-slate-500">
                      {log.employee?.name ?? "System"} · {formatDate(log.createdAt)}
                    </p>
                  </div>
                  <Badge variant="secondary">{log.action}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
