import { requireAuth, requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ConnectionsInbox } from "@/components/connections/connections-inbox";

export default async function ConnectionsPage() {
  const ctx = await requireAuth();
  await requirePermission(ctx, PERMISSIONS.VIEW_CONNECTIONS);
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-slate-900">Connections</h1><p className="text-sm text-slate-500">Private, business-scoped employee messaging.</p></div><ConnectionsInbox currentEmployeeId={ctx.employee.id} /></div>;
}
