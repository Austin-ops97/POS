import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listOfficeFolders } from "@/lib/office/folder-service";
import { OfficeDocumentCreator } from "@/components/office/document-creator";

export default async function NewOfficeDocumentPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS)) redirect("/office");
  return (
    <OfficeDocumentCreator
      folders={await listOfficeFolders(ctx)}
      canManageTemplates={hasPermission(ctx, PERMISSIONS.MANAGE_DOCUMENT_TEMPLATES)}
    />
  );
}
