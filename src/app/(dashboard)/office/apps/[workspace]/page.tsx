import { notFound, redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { getOfficeSuiteModule, isCustomOfficeWorkspace } from "@/lib/office/suite";
import { listOfficeWorkspaceRecords } from "@/lib/office/workspace-service";
import { SpreadsheetApp } from "@/components/office/apps/spreadsheet-app";
import { PresentationApp } from "@/components/office/apps/presentation-app";
import { CommunicationApp } from "@/components/office/apps/communication-app";
import { CalendarApp } from "@/components/office/apps/calendar-app";
import { FormsApp } from "@/components/office/apps/forms-app";
import { TaskAssignmentsApp } from "@/components/office/apps/task-assignments-app";
import { ProjectsApp } from "@/components/office/apps/projects-app";
import { WorkflowsApp } from "@/components/office/apps/workflows-app";
import { UtilitiesApp } from "@/components/office/apps/utilities-app";

type Props = { params: Promise<{ workspace: string }> };

export default async function OfficeModulePage({ params }: Props) {
  const { workspace } = await params;
  const tool = getOfficeSuiteModule(workspace);
  if (!tool) notFound();
  if (tool.nativeHref) redirect(tool.nativeHref);
  if (!isCustomOfficeWorkspace(workspace)) notFound();

  const ctx = await requireAuth();
  const [records, employees] = await Promise.all([
    listOfficeWorkspaceRecords(ctx, workspace, { includeComplete: true }),
    db.employeeProfile.findMany({
      where: { businessId: ctx.business.id, status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
  ]);
  const permissions = {
    canCreate: hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS),
    canEdit: hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS),
    canDelete: hasPermission(ctx, PERMISSIONS.DELETE_DOCUMENTS),
    canManageReminders: hasPermission(ctx, PERMISSIONS.MANAGE_PROJECT_REMINDERS),
    canSubmitCompletion: hasPermission(ctx, PERMISSIONS.SUBMIT_PROJECT_COMPLETION),
    canApproveCompletion: hasPermission(ctx, PERMISSIONS.APPROVE_PROJECT_COMPLETION),
    canReopenProject: hasPermission(ctx, PERMISSIONS.REOPEN_PROJECT),
  };

  switch (workspace) {
    case "spreadsheets": return <SpreadsheetApp module={tool} initialRecords={records} permissions={permissions} />;
    case "presentations": return <PresentationApp module={tool} initialRecords={records} permissions={permissions} />;
    case "communication": return <CommunicationApp module={tool} initialRecords={records} permissions={permissions} />;
    case "calendar": return <CalendarApp module={tool} initialRecords={records} employees={employees} permissions={permissions} />;
    case "task-assignments": return <TaskAssignmentsApp module={tool} initialRecords={records} employees={employees} permissions={permissions} />;
    case "forms-approvals": return <FormsApp module={tool} initialRecords={records} permissions={permissions} />;
    case "projects": return <ProjectsApp module={tool} initialRecords={records} employees={employees} permissions={permissions} />;
    case "automations-ai": return <WorkflowsApp module={tool} initialRecords={records} permissions={permissions} />;
    case "utilities": return <UtilitiesApp module={tool} />;
  }
}
