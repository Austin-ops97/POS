import { db } from "./db";
import type { AuditAction } from "@prisma/client";

export async function createAuditLog(params: {
  businessId: string;
  employeeId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  return db.auditLog.create({
    data: {
      businessId: params.businessId,
      employeeId: params.employeeId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      details: params.details ? JSON.parse(JSON.stringify(params.details)) : undefined,
      ipAddress: params.ipAddress,
    },
  });
}
