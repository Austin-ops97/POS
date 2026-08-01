import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ApprovalQueue } from "@/components/office/apps/approval-queue";

export default async function OfficeApprovalsPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.APPROVE_PROJECT_COMPLETION)) {
    redirect("/office");
  }
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Project approvals</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review completion photos and approve, request changes, or reject submissions.
        </p>
      </div>
      <ApprovalQueue />
    </div>
  );
}
