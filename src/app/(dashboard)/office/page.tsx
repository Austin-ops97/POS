import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listOfficeDocuments } from "@/lib/office/document-service";
import { listOfficeFolders } from "@/lib/office/folder-service";
import { OfficeWorkspace } from "@/components/office/office-workspace";

export default async function OfficePage() {
  const ctx = await requireAuth();
  const [documents, folders] = await Promise.all([
    listOfficeDocuments(ctx, { pageSize: "100" }),
    listOfficeFolders(ctx),
  ]);

  return (
    <OfficeWorkspace
      initialDocuments={documents.items}
      folders={folders}
      permissions={{
        canCreate: hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS),
        canScan: hasPermission(ctx, PERMISSIONS.SCAN_DOCUMENTS),
        canManageFolders: hasPermission(ctx, PERMISSIONS.MANAGE_DOCUMENT_FOLDERS),
        canDelete: hasPermission(ctx, PERMISSIONS.DELETE_DOCUMENTS),
      }}
    />
  );
}

