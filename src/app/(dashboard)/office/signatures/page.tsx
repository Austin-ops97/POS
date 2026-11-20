import { requireAuth, hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { listEsignRequests } from "@/lib/office/esign-service";
import { db } from "@/lib/db";
import { OfficeEsignClient } from "@/components/office/office-esign-client";

export default async function OfficeSignaturesPage() {
  const ctx = await requireAuth();
  const [requests, documents, customers] = await Promise.all([
    listEsignRequests(ctx),
    db.officeDocument.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.customer.findMany({
      where: { businessId: ctx.business.id, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: "asc" },
      take: 100,
    }),
  ]);
  return (
    <OfficeEsignClient
      initial={requests}
      documents={documents}
      customers={customers.map((customer) => ({
        id: customer.id,
        name: `${customer.firstName} ${customer.lastName ?? ""}`.trim(),
        email: customer.email,
      }))}
      canCreate={hasPermission(ctx, PERMISSIONS.CREATE_DOCUMENTS)}
    />
  );
}
