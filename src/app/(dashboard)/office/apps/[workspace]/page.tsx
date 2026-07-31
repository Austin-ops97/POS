import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { getOfficeSuiteModule } from "@/lib/office/suite";
import { listOfficeWorkspaceRecords } from "@/lib/office/workspace-service";
import { OfficeModuleWorkspace } from "@/components/office/office-module-workspace";

type Props = { params: Promise<{ workspace: string }> };

export default async function OfficeModulePage({ params }: Props) {
  const { workspace } = await params;
  const workspaceDefinition = getOfficeSuiteModule(workspace);
  if (!workspaceDefinition || workspace === "documents") notFound();

  const ctx = await requireAuth();
  const [records, employees] = await Promise.all([
    listOfficeWorkspaceRecords(ctx, workspace, { includeComplete: true }),
    db.employeeProfile.findMany({
      where: { businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <OfficeModuleWorkspace
      module={workspaceDefinition}
      initialRecords={records}
      employees={employees}
      permissions={{
        canCreate: hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS),
        canEdit: hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS),
        canDelete: hasPermission(ctx, PERMISSIONS.DELETE_DOCUMENTS),
      }}
    />
  );
}
