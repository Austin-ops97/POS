import { redirect } from "next/navigation";
import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listOfficeFolders } from "@/lib/office/folder-service";
import { OfficeScanner } from "@/components/office/office-scanner";

export default async function OfficeScanPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.SCAN_DOCUMENTS)) redirect("/office");
  return <OfficeScanner folders={await listOfficeFolders(ctx)} />;
}

