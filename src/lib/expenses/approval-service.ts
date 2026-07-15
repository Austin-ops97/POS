import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth";
import { hasPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ExpenseStatus } from "@prisma/client";
import { expenseApprovalSchema } from "@/lib/validations/expenses";
import { logExpenseAudit } from "./audit";
import { notifyEmployee, notifyManagers } from "./notifications";
import { expenseInclude, getExpenseById } from "./expense-service";
import { z } from "zod";

export async function processApprovalAction(
  ctx: AuthContext,
  expenseId: string,
  raw: z.infer<typeof expenseApprovalSchema>,
  ipAddress?: string
) {
  const data = expenseApprovalSchema.parse(raw);
  const expense = await getExpenseById(ctx, expenseId);
  if (!expense) throw new Error("Expense not found");

  const fromStatus = expense.status;
  let toStatus: ExpenseStatus = fromStatus;
  const action = data.action;
  let systemAction:
    | "EXPENSE_APPROVE"
    | "EXPENSE_REJECT"
    | "EXPENSE_REIMBURSE"
    | "EXPENSE_FLAG"
    | "EXPENSE_UPDATE" = "EXPENSE_UPDATE";

  switch (data.action) {
    case "APPROVE": {
      if (!hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES)) {
        throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_EXPENSES}`);
      }
      if (!["SUBMITTED", "PENDING_APPROVAL", "NEEDS_MORE_INFO"].includes(fromStatus)) {
        throw new Error("Expense is not awaiting approval");
      }
      toStatus = "APPROVED";
      systemAction = "EXPENSE_APPROVE";
      break;
    }
    case "REJECT": {
      if (!hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES)) {
        throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_EXPENSES}`);
      }
      toStatus = "REJECTED";
      systemAction = "EXPENSE_REJECT";
      break;
    }
    case "REQUEST_CHANGES": {
      if (!hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES)) {
        throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_EXPENSES}`);
      }
      toStatus = "NEEDS_MORE_INFO";
      systemAction = "EXPENSE_UPDATE";
      break;
    }
    case "FLAG": {
      if (
        !hasPermission(ctx, PERMISSIONS.APPROVE_EXPENSES) &&
        !hasPermission(ctx, PERMISSIONS.VIEW_TEAM_EXPENSES)
      ) {
        throw new Error(`Missing permission: ${PERMISSIONS.APPROVE_EXPENSES}`);
      }
      await db.expenseFlag.create({
        data: {
          expenseId,
          type: "MANUAL",
          severity: "WARNING",
          message: data.flagMessage || data.note || "Flagged for review",
          raisedById: ctx.employee.id,
        },
      });
      systemAction = "EXPENSE_FLAG";
      await notifyManagers({
        businessId: ctx.business.id,
        type: "SUSPICIOUS_PURCHASE",
        title: "Expense flagged",
        body: `${expense.merchant} was flagged by ${ctx.employee.name}.`,
        expenseId,
      });
      break;
    }
    case "REIMBURSE": {
      if (!hasPermission(ctx, PERMISSIONS.REIMBURSE_EXPENSES)) {
        throw new Error(`Missing permission: ${PERMISSIONS.REIMBURSE_EXPENSES}`);
      }
      if (!["APPROVED", "PAID"].includes(fromStatus) && fromStatus !== "REIMBURSED") {
        // Allow from APPROVED primarily
        if (fromStatus !== "APPROVED") {
          throw new Error("Only approved expenses can be reimbursed");
        }
      }
      toStatus = "REIMBURSED";
      systemAction = "EXPENSE_REIMBURSE";
      break;
    }
    case "MARK_PAID": {
      if (!hasPermission(ctx, PERMISSIONS.REIMBURSE_EXPENSES)) {
        throw new Error(`Missing permission: ${PERMISSIONS.REIMBURSE_EXPENSES}`);
      }
      toStatus = "PAID";
      systemAction = "EXPENSE_REIMBURSE";
      break;
    }
    default:
      throw new Error("Unsupported action");
  }

  await db.expense.update({
    where: { id: expenseId },
    data: {
      status: toStatus,
      ...(data.action === "APPROVE" ? { approvedAt: new Date() } : {}),
      ...(data.action === "REJECT" ? { rejectedAt: new Date() } : {}),
      ...(data.action === "REIMBURSE"
        ? {
            reimbursedAt: new Date(),
            reimbursedAmount: expense.total,
          }
        : {}),
      ...(data.action === "MARK_PAID" ? { paidAt: new Date() } : {}),
    },
  });

  if (data.action !== "FLAG") {
    await db.expenseApprovalEvent.create({
      data: {
        expenseId,
        actorId: ctx.employee.id,
        fromStatus,
        toStatus,
        action,
        note: data.note,
      },
    });
  }

  if (data.note && data.action !== "FLAG") {
    await db.expenseComment.create({
      data: {
        expenseId,
        authorId: ctx.employee.id,
        body: data.note,
      },
    });
  }

  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    expenseId,
    action: data.action,
    entity: "Expense",
    entityId: expenseId,
    before: { status: fromStatus },
    after: { status: toStatus, note: data.note },
    ipAddress,
    systemAction,
  });

  if (data.action === "APPROVE") {
    await notifyEmployee({
      businessId: ctx.business.id,
      employeeId: expense.employeeId,
      type: "EXPENSE_APPROVED",
      title: "Expense approved",
      body: `Your expense for ${expense.merchant} was approved.`,
      expenseId,
    });
  } else if (data.action === "REJECT") {
    await notifyEmployee({
      businessId: ctx.business.id,
      employeeId: expense.employeeId,
      type: "EXPENSE_REJECTED",
      title: "Expense rejected",
      body: data.note || `Your expense for ${expense.merchant} was rejected.`,
      expenseId,
    });
  } else if (data.action === "REQUEST_CHANGES") {
    await notifyEmployee({
      businessId: ctx.business.id,
      employeeId: expense.employeeId,
      type: "REQUEST_CHANGES",
      title: "More information needed",
      body: data.note || `Please update your expense for ${expense.merchant}.`,
      expenseId,
    });
  } else if (data.action === "REIMBURSE" || data.action === "MARK_PAID") {
    await notifyEmployee({
      businessId: ctx.business.id,
      employeeId: expense.employeeId,
      type: "REIMBURSEMENT_PAID",
      title: data.action === "REIMBURSE" ? "Reimbursement recorded" : "Expense marked paid",
      body: `${expense.merchant} — $${Number(expense.total).toFixed(2)}.`,
      expenseId,
    });
  }

  return db.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: expenseInclude,
  });
}

export async function addExpenseComment(
  ctx: AuthContext,
  expenseId: string,
  body: string,
  ipAddress?: string
) {
  const expense = await getExpenseById(ctx, expenseId);
  if (!expense) throw new Error("Expense not found");

  const comment = await db.expenseComment.create({
    data: {
      expenseId,
      authorId: ctx.employee.id,
      body,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  await logExpenseAudit({
    businessId: ctx.business.id,
    actorId: ctx.employee.id,
    expenseId,
    action: "COMMENT",
    entity: "ExpenseComment",
    entityId: comment.id,
    after: comment,
    ipAddress,
    systemAction: "EXPENSE_COMMENT",
  });

  const recipientId =
    expense.employeeId === ctx.employee.id
      ? null
      : expense.employeeId;

  if (recipientId) {
    await notifyEmployee({
      businessId: ctx.business.id,
      employeeId: recipientId,
      type: "MANAGER_COMMENTED",
      title: "New comment on expense",
      body: `${ctx.employee.name}: ${body.slice(0, 140)}`,
      expenseId,
    });
  } else {
    await notifyManagers({
      businessId: ctx.business.id,
      type: "MANAGER_COMMENTED",
      title: "Employee commented on expense",
      body: `${ctx.employee.name}: ${body.slice(0, 140)}`,
      expenseId,
      excludeEmployeeId: ctx.employee.id,
    });
  }

  return comment;
}
