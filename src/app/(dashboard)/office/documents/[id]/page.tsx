import { notFound } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getOfficeDocument } from "@/lib/office/document-service";
import { listOfficeFolders, listOfficeTags } from "@/lib/office/folder-service";
import { OfficeEditor } from "@/components/office/office-editor";
import { OfficeFileDocument } from "@/components/office/office-file-document";

export default async function OfficeDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth();
  const { id } = await params;
  try {
    const [document, folders, tags] = await Promise.all([
      getOfficeDocument(ctx, id),
      listOfficeFolders(ctx),
      listOfficeTags(ctx),
    ]);
    const canEditOwnDraft =
      document.createdBy.id === ctx.employee.id &&
      document.status === "DRAFT" &&
      hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS);
    const capabilities = {
      canEdit: hasPermission(ctx, PERMISSIONS.EDIT_DOCUMENTS) || canEditOwnDraft,
      canDelete: hasPermission(ctx, PERMISSIONS.DELETE_DOCUMENTS),
      canManageTemplates: hasPermission(ctx, PERMISSIONS.MANAGE_DOCUMENT_TEMPLATES),
      canViewSensitive: hasPermission(ctx, PERMISSIONS.VIEW_SENSITIVE_DOCUMENTS),
      canApprove: hasPermission(ctx, PERMISSIONS.APPROVE_DOCUMENTS),
    };
    if (document.kind === "RICH_TEXT" || document.kind === "TEMPLATE") {
      return (
        <OfficeEditor
          document={document}
          folders={folders}
          tags={tags}
          capabilities={capabilities}
        />
      );
    }
    return <OfficeFileDocument document={document} capabilities={capabilities} />;
  } catch (error) {
    if (error instanceof Error && error.message === "Office document not found") notFound();
    throw error;
  }
}
