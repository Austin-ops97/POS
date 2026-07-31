import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { getBusinessModuleAccess } from "@/lib/access-control";
import { BusinessControl } from "@/components/admin/business-control";

export default async function AdminBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const business = await db.business.findFirst({ where: { id, deletedAt: null } });
  if (!business) notFound();
  const modules = await getBusinessModuleAccess(id);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">{business.name}</h1><p className="text-slate-500">Platform-owned licensing and access controls.</p></div>
      <BusinessControl id={id} initialStatus={business.status} initialModules={modules} />
    </div>
  );
}
