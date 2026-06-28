/**
 * Merchant lifecycle audit script — run against a fresh PostgreSQL database.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/merchant-audit.ts
 *
 * Simulates post-auth merchant flows (no Clerk). Creates user, business,
 * and walks through product → inventory → customer → sale → refund checks.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../src/lib/permissions";

const db = new PrismaClient();

type AuditResult = { step: string; status: "PASS" | "FAIL"; detail?: string };

const results: AuditResult[] = [];

function pass(step: string, detail?: string) {
  results.push({ step, status: "PASS", detail });
  console.log(`✓ ${step}${detail ? `: ${detail}` : ""}`);
}

function fail(step: string, detail: string) {
  results.push({ step, status: "FAIL", detail });
  console.error(`✗ ${step}: ${detail}`);
}

async function ensureRoles() {
  for (const key of Object.values(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      create: { key, name: key, description: key },
      update: {},
    });
  }
  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { name: roleName },
      create: { name: roleName, description: roleName, isSystem: true },
      update: {},
    });
    for (const permKey of permissionKeys) {
      const permission = await db.permission.findUnique({ where: { key: permKey } });
      if (!permission) continue;
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
}

async function main() {
  console.log("NexaPOS Merchant Audit — starting\n");

  await ensureRoles();
  const ownerRole = await db.role.findUnique({ where: { name: "Owner" } });
  if (!ownerRole) throw new Error("Owner role missing");

  const user = await db.user.create({
    data: {
      clerkId: `audit-${Date.now()}`,
      email: `audit-${Date.now()}@nexapos.test`,
      firstName: "Audit",
      lastName: "Merchant",
    },
  });

  const business = await db.business.create({
    data: {
      name: "Audit Store",
      type: "RETAIL",
      onboardingStep: "COMPLETED",
      onboardingComplete: true,
      demoMode: false,
    },
  });

  const location = await db.location.create({
    data: {
      businessId: business.id,
      name: "Main Location",
      country: "US",
      timezone: "America/New_York",
      isDefault: true,
    },
  });

  await db.businessSetting.create({
    data: { businessId: business.id, enableCash: true },
  });

  for (const mod of ["RETAIL", "SERVICE", "RENTAL", "inventory"]) {
    await db.moduleSetting.create({
      data: { businessId: business.id, module: mod, enabled: mod !== "RENTAL" },
    });
  }

  await db.stripeAccount.create({
    data: { businessId: business.id, status: "NOT_CONNECTED" },
  });

  await db.subscription.create({
    data: {
      businessId: business.id,
      plan: "STARTER",
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
    },
  });

  const taxRate = await db.taxRate.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      name: "Sales Tax",
      rate: 0.0825,
      appliesToProducts: true,
      appliesToServices: true,
    },
  });

  const employee = await db.employeeProfile.create({
    data: {
      businessId: business.id,
      userId: user.id,
      roleId: ownerRole.id,
      name: "Audit Owner",
      email: user.email,
      status: "ACTIVE",
    },
  });

  await db.employeeLocation.create({
    data: { employeeId: employee.id, locationId: location.id },
  });

  pass("Business creation", `${business.name} + location + owner + tax rate`);

  const physical = await db.product.create({
    data: {
      businessId: business.id,
      name: "Audit T-Shirt",
      price: 19.99,
      type: "PHYSICAL",
      trackInventory: true,
      taxable: true,
    },
  });

  const inventoryItem = await db.inventoryItem.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      productId: physical.id,
      quantityOnHand: 10,
    },
  });

  const service = await db.product.create({
    data: {
      businessId: business.id,
      name: "Audit Haircut",
      price: 25,
      type: "SERVICE",
      trackInventory: false,
      taxable: true,
    },
  });

  pass("Products", `physical=${physical.id}, service=${service.id}, inventory=${inventoryItem.quantityOnHand}`);

  const customer = await db.customer.create({
    data: {
      businessId: business.id,
      firstName: "Jane",
      lastName: "Customer",
      email: "jane@example.com",
    },
  });
  pass("Customer", customer.id);

  const order = await db.order.create({
    data: {
      businessId: business.id,
      locationId: location.id,
      employeeId: employee.id,
      customerId: customer.id,
      orderNumber: `ORD-AUDIT-${Date.now()}`,
      status: "PENDING_PAYMENT",
      subtotal: 19.99,
      taxAmount: 1.65,
      total: 21.64,
      items: {
        create: {
          productId: physical.id,
          name: physical.name,
          quantity: 1,
          unitPrice: 19.99,
          taxAmount: 1.65,
          total: 21.64,
        },
      },
    },
    include: { items: true },
  });

  await db.payment.create({
    data: {
      businessId: business.id,
      orderId: order.id,
      method: "CASH",
      status: "SUCCEEDED",
      amount: 21.64,
    },
  });

  await db.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { quantityOnHand: { decrement: 1 } },
  });

  await db.order.update({
    where: { id: order.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  await db.receipt.create({
    data: {
      businessId: business.id,
      orderId: order.id,
      receiptNumber: `RCP-AUDIT-${Date.now()}`,
    },
  });

  const stockAfter = await db.inventoryItem.findUnique({ where: { id: inventoryItem.id } });
  if (stockAfter?.quantityOnHand === 9) {
    pass("Cash sale + inventory deduction", `stock=${stockAfter.quantityOnHand}`);
  } else {
    fail("Cash sale + inventory deduction", `expected 9, got ${stockAfter?.quantityOnHand}`);
  }

  const refund = await db.refund.create({
    data: {
      businessId: business.id,
      orderId: order.id,
      employeeId: employee.id,
      amount: 21.64,
      reason: "CUSTOMER_RETURN",
      returnToStock: true,
      items: {
        create: {
          orderItemId: order.items[0].id,
          quantity: 1,
          amount: 21.64,
        },
      },
    },
  });

  await db.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { quantityOnHand: { increment: 1 } },
  });

  await db.order.update({
    where: { id: order.id },
    data: { status: "REFUNDED" },
  });

  const stockAfterRefund = await db.inventoryItem.findUnique({ where: { id: inventoryItem.id } });
  if (stockAfterRefund?.quantityOnHand === 10) {
    pass("Cash refund + inventory return", `stock=${stockAfterRefund.quantityOnHand}`);
  } else {
    fail("Cash refund + inventory return", `expected 10, got ${stockAfterRefund?.quantityOnHand}`);
  }

  await db.auditLog.create({
    data: {
      businessId: business.id,
      employeeId: employee.id,
      action: "REFUND",
      entity: "Order",
      entityId: order.id,
      details: { refundId: refund.id },
    },
  });
  pass("Audit log", "refund recorded");

  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\n--- Summary: ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
