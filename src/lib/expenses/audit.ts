import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import type { AuditAction, Prisma } from "@prisma/client";

export async function logExpenseAudit(params: {
  businessId: string;
  actorId?: string;
  expenseId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  systemAction?: AuditAction;
}) {
  const beforeJson = params.before
    ? (JSON.parse(JSON.stringify(params.before)) as Prisma.InputJsonValue)
    : undefined;
  const afterJson = params.after
    ? (JSON.parse(JSON.stringify(params.after)) as Prisma.InputJsonValue)
    : undefined;

  const [event] = await Promise.all([
    db.expenseAuditEvent.create({
      data: {
        businessId: params.businessId,
        actorId: params.actorId,
        expenseId: params.expenseId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: beforeJson,
        after: afterJson,
        ipAddress: params.ipAddress,
      },
    }),
    params.systemAction
      ? createAuditLog({
          businessId: params.businessId,
          employeeId: params.actorId,
          action: params.systemAction,
          entity: params.entity,
          entityId: params.entityId ?? params.expenseId,
          details: {
            expenseAction: params.action,
            before: params.before,
            after: params.after,
          },
          ipAddress: params.ipAddress,
        })
      : Promise.resolve(null),
  ]);

  return event;
}
