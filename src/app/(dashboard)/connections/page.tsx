import { hasPermission, requireAuth, requirePermission } from "@/lib/auth";
import { getEmployeeModuleAccess } from "@/lib/access-control";
import { getBusinessSettings } from "@/lib/queries";
import { PERMISSIONS } from "@/lib/permissions";
import { isCallProviderConfigured } from "@/lib/calls/provider";
import { ConnectionsInbox } from "@/components/connections/connections-inbox";

export default async function ConnectionsPage() {
  const ctx = await requireAuth();
  await requirePermission(ctx, PERMISSIONS.VIEW_CONNECTIONS);

  const [modules, settings] = await Promise.all([
    getEmployeeModuleAccess(ctx),
    getBusinessSettings(ctx),
  ]);

  const moduleOn = modules.VIDEO_CALLING !== false;
  const enableVideoCalling = moduleOn && (settings?.enableVideoCalling ?? true);
  const enableGroupCalling = settings?.enableGroupCalling ?? true;
  const enableScreenSharing = settings?.enableScreenSharing ?? true;

  const canStartCalls =
    enableVideoCalling && hasPermission(ctx, PERMISSIONS.START_CONNECTION_CALLS);
  const canJoinCalls =
    enableVideoCalling && hasPermission(ctx, PERMISSIONS.JOIN_CONNECTION_CALLS);
  const canModerateCalls =
    enableVideoCalling && hasPermission(ctx, PERMISSIONS.MODERATE_CONNECTION_CALLS);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Connections</h1>
        <p className="text-sm text-slate-500">Private, business-scoped employee messaging.</p>
      </div>
      <ConnectionsInbox
        currentEmployeeId={ctx.employee.id}
        canStartCalls={canStartCalls}
        canJoinCalls={canJoinCalls}
        canModerateCalls={canModerateCalls}
        callsConfigured={isCallProviderConfigured()}
        callSettings={{
          enableVideoCalling,
          enableGroupCalling,
          enableScreenSharing,
        }}
      />
    </div>
  );
}
