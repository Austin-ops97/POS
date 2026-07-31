import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();
  const moduleSetting = await db.moduleSetting.findUnique({
    where: { businessId_module: { businessId: ctx.business.id, module: "OFFICE" } },
    select: { enabled: true },
  });
  if (
    moduleSetting?.enabled === false ||
    (!hasPermission(ctx, PERMISSIONS.VIEW_DOCUMENTS) &&
      !hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS) &&
      !hasPermission(ctx, PERMISSIONS.SCAN_DOCUMENTS))
  ) {
    redirect("/dashboard");
  }
  return children;
}

