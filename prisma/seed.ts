import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ROLE_PERMISSIONS } from "../src/lib/permissions";

const db = new PrismaClient();

async function seedRolesAndPermissions() {
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await db.role.findUnique({ where: { name: roleName } });
    if (!role) {
      role = await db.role.create({
        data: { name: roleName, description: `${roleName} role`, isSystem: true },
      });
    }

    for (const permKey of permissions) {
      let perm = await db.permission.findUnique({ where: { key: permKey } });
      if (!perm) {
        perm = await db.permission.create({
          data: {
            key: permKey,
            name: permKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          },
        });
      }

      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }
  }
}

async function main() {
  console.log("Seeding NexaPOS demo data...");

  await seedRolesAndPermissions();

  const ownerRole = await db.role.findUniqueOrThrow({ where: { name: "Owner" } });
  const managerRole = await db.role.findUniqueOrThrow({ where: { name: "Manager" } });
  const cashierRole = await db.role.findUniqueOrThrow({ where: { name: "Cashier" } });

  const business = await db.business.upsert({
    where: { id: "demo-business" },
    create: {
      id: "demo-business",
      name: "Demo Market & Services",
      legalName: "Demo Market & Services LLC",
      type: "HYBRID",
      phone: "(555) 123-4567",
      email: "demo@nexapos.com",
      website: "https://demo.nexapos.com",
      primaryColor: "#1e3a5f",
      onboardingStep: "COMPLETED",
      onboardingComplete: true,
      demoMode: true,
    },
    update: {},
  });

  const location = await db.location.upsert({
    where: { id: "demo-location" },
    create: {
      id: "demo-location",
      businessId: business.id,
      name: "Main Store",
      street: "123 Commerce St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      country: "US",
      timezone: "America/Chicago",
      taxRegion: "TX",
      isDefault: true,
    },
    update: {},
  });

  await db.businessSetting.upsert({
    where: { businessId: business.id },
    create: { businessId: business.id },
    update: {},
  });

  await db.stripeAccount.upsert({
    where: { businessId: business.id },
    create: { businessId: business.id, status: "NOT_CONNECTED" },
    update: {},
  });

  await db.subscription.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      plan: "PRO",
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    update: {},
  });

  const modules = ["retail", "service", "rental", "restaurant"];
  for (const mod of modules) {
    await db.moduleSetting.upsert({
      where: { businessId_module: { businessId: business.id, module: mod } },
      create: { businessId: business.id, module: mod, enabled: mod !== "restaurant" },
      update: {},
    });
  }

  await db.taxRate.upsert({
    where: { id: "demo-tax" },
    create: {
      id: "demo-tax",
      businessId: business.id,
      locationId: location.id,
      name: "Sales Tax",
      rate: 0.0825,
    },
    update: {},
  });

  const pinHash = await bcrypt.hash("1234", 10);

  const employees = [
    { id: "demo-owner", name: "Alex Owner", email: "owner@demo.nexapos.com", roleId: ownerRole.id },
    { id: "demo-manager", name: "Maria Manager", email: "manager@demo.nexapos.com", roleId: managerRole.id },
    { id: "demo-cashier", name: "Chris Cashier", email: "cashier@demo.nexapos.com", roleId: cashierRole.id },
  ];

  for (const emp of employees) {
    await db.employeeProfile.upsert({
      where: { id: emp.id },
      create: {
        id: emp.id,
        businessId: business.id,
        roleId: emp.roleId,
        name: emp.name,
        email: emp.email,
        pinHash,
        status: "ACTIVE",
      },
      update: {},
    });

    await db.employeeLocation.upsert({
      where: { employeeId_locationId: { employeeId: emp.id, locationId: location.id } },
      create: { employeeId: emp.id, locationId: location.id },
      update: {},
    });
  }

  const categories = [
    { id: "cat-apparel", name: "Apparel" },
    { id: "cat-electronics", name: "Electronics" },
    { id: "cat-drinks", name: "Drinks" },
    { id: "cat-services", name: "Services" },
    { id: "cat-rentals", name: "Rentals" },
  ];

  for (const cat of categories) {
    await db.category.upsert({
      where: { id: cat.id },
      create: { id: cat.id, businessId: business.id, name: cat.name },
      update: {},
    });
  }

  const products = [
    { id: "prod-tshirt", name: "T-Shirt", sku: "APP-001", barcode: "100000000001", price: 24.99, cost: 8.0, categoryId: "cat-apparel", type: "PHYSICAL" as const },
    { id: "prod-hat", name: "Hat", sku: "APP-002", barcode: "100000000002", price: 19.99, cost: 6.0, categoryId: "cat-apparel", type: "PHYSICAL" as const },
    { id: "prod-coffee", name: "Coffee", sku: "DRK-001", barcode: "100000000003", price: 4.50, cost: 1.2, categoryId: "cat-drinks", type: "PHYSICAL" as const },
    { id: "prod-charger", name: "Phone Charger", sku: "ELC-001", barcode: "100000000004", price: 29.99, cost: 12.0, categoryId: "cat-electronics", type: "PHYSICAL" as const },
    { id: "prod-service", name: "Service Labor - 1 Hour", sku: "SVC-001", price: 85.0, cost: 0, categoryId: "cat-services", type: "SERVICE" as const, trackInventory: false },
    { id: "prod-rental", name: "Equipment Rental - Daily", sku: "RNT-001", price: 45.0, cost: 0, categoryId: "cat-rentals", type: "RENTAL" as const, trackInventory: false },
    { id: "prod-custom", name: "Custom Fee", sku: "CUS-001", price: 0, cost: 0, categoryId: "cat-services", type: "CUSTOM" as const, trackInventory: false },
  ];

  for (const prod of products) {
    await db.product.upsert({
      where: { id: prod.id },
      create: {
        id: prod.id,
        businessId: business.id,
        categoryId: prod.categoryId,
        name: prod.name,
        sku: prod.sku,
        barcode: prod.barcode,
        price: prod.price,
        cost: prod.cost,
        type: prod.type,
        trackInventory: prod.trackInventory ?? true,
        isFavorite: ["prod-tshirt", "prod-coffee"].includes(prod.id),
      },
      update: {},
    });

    if (prod.trackInventory !== false) {
      await db.inventoryItem.upsert({
        where: { locationId_productId: { locationId: location.id, productId: prod.id } },
        create: {
          businessId: business.id,
          locationId: location.id,
          productId: prod.id,
          quantityOnHand: prod.id === "prod-charger" ? 3 : 50,
          reorderPoint: 10,
          costPerUnit: prod.cost,
        },
        update: {},
      });
    }
  }

  const customers = [
    { id: "cust-john", firstName: "John", lastName: "Smith", email: "john@example.com", phone: "555-0101" },
    { id: "cust-sarah", firstName: "Sarah", lastName: "Johnson", email: "sarah@example.com", phone: "555-0102" },
    { id: "cust-biz", firstName: "Business Account", lastName: "Customer", email: "accounts@bizcorp.com", phone: "555-0103" },
  ];

  for (const cust of customers) {
    await db.customer.upsert({
      where: { id: cust.id },
      create: { ...cust, businessId: business.id },
      update: {},
    });
  }

  // Demo orders
  const orders = [
    {
      id: "order-paid-card",
      orderNumber: "ORD-DEMO-001",
      status: "PAID" as const,
      customerId: "cust-john",
      employeeId: "demo-cashier",
      subtotal: 29.49,
      taxAmount: 2.43,
      total: 31.92,
      paymentMethod: "CARD" as const,
    },
    {
      id: "order-paid-cash",
      orderNumber: "ORD-DEMO-002",
      status: "PAID" as const,
      customerId: "cust-sarah",
      employeeId: "demo-cashier",
      subtotal: 24.99,
      taxAmount: 2.06,
      total: 27.05,
      paymentMethod: "CASH" as const,
    },
    {
      id: "order-refunded",
      orderNumber: "ORD-DEMO-003",
      status: "REFUNDED" as const,
      customerId: "cust-biz",
      employeeId: "demo-manager",
      subtotal: 29.99,
      taxAmount: 2.47,
      total: 32.46,
      paymentMethod: "CARD" as const,
    },
    {
      id: "order-held",
      orderNumber: "ORD-DEMO-004",
      status: "HELD" as const,
      employeeId: "demo-cashier",
      subtotal: 4.5,
      taxAmount: 0.37,
      total: 4.87,
    },
  ];

  for (const order of orders) {
    await db.order.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        businessId: business.id,
        locationId: location.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerId: order.customerId,
        employeeId: order.employeeId,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        total: order.total,
        paidAt: order.status === "PAID" || order.status === "REFUNDED" ? new Date() : undefined,
        heldAt: order.status === "HELD" ? new Date() : undefined,
      },
      update: {},
    });

    if (order.id === "order-paid-card") {
      await db.orderItem.upsert({
        where: { id: "oi-card-1" },
        create: {
          id: "oi-card-1",
          orderId: order.id,
          productId: "prod-coffee",
          name: "Coffee",
          sku: "DRK-001",
          quantity: 2,
          unitPrice: 4.5,
          taxAmount: 0.74,
          total: 9.74,
        },
        update: {},
      });
      await db.orderItem.upsert({
        where: { id: "oi-card-2" },
        create: {
          id: "oi-card-2",
          orderId: order.id,
          productId: "prod-charger",
          name: "Phone Charger",
          sku: "ELC-001",
          quantity: 1,
          unitPrice: 29.99,
          taxAmount: 2.47,
          total: 32.46,
        },
        update: {},
      });
      await db.payment.upsert({
        where: { id: "pay-card-1" },
        create: {
          id: "pay-card-1",
          businessId: business.id,
          orderId: order.id,
          method: "CARD",
          status: "SUCCEEDED",
          amount: 31.92,
          stripePaymentIntentId: "pi_demo_card_001",
          cardLast4: "4242",
          cardBrand: "visa",
        },
        update: {},
      });
    }

    if (order.id === "order-paid-cash") {
      await db.orderItem.upsert({
        where: { id: "oi-cash-1" },
        create: {
          id: "oi-cash-1",
          orderId: order.id,
          productId: "prod-tshirt",
          name: "T-Shirt",
          sku: "APP-001",
          quantity: 1,
          unitPrice: 24.99,
          taxAmount: 2.06,
          total: 27.05,
        },
        update: {},
      });
      await db.payment.upsert({
        where: { id: "pay-cash-1" },
        create: {
          id: "pay-cash-1",
          businessId: business.id,
          orderId: order.id,
          method: "CASH",
          status: "SUCCEEDED",
          amount: 27.05,
        },
        update: {},
      });
    }

    if (order.id === "order-refunded") {
      await db.orderItem.upsert({
        where: { id: "oi-refund-1" },
        create: {
          id: "oi-refund-1",
          orderId: order.id,
          productId: "prod-charger",
          name: "Phone Charger",
          sku: "ELC-001",
          quantity: 1,
          unitPrice: 29.99,
          taxAmount: 2.47,
          total: 32.46,
        },
        update: {},
      });
      await db.payment.upsert({
        where: { id: "pay-refund-1" },
        create: {
          id: "pay-refund-1",
          businessId: business.id,
          orderId: order.id,
          method: "CARD",
          status: "SUCCEEDED",
          amount: 32.46,
          stripePaymentIntentId: "pi_demo_refund_001",
        },
        update: {},
      });
      await db.refund.upsert({
        where: { id: "refund-1" },
        create: {
          id: "refund-1",
          businessId: business.id,
          orderId: order.id,
          employeeId: "demo-manager",
          amount: 32.46,
          taxAmount: 2.47,
          reason: "CUSTOMER_RETURN",
          stripeRefundId: "re_demo_001",
          returnToStock: true,
        },
        update: {},
      });
    }

    if (order.id === "order-held") {
      await db.orderItem.upsert({
        where: { id: "oi-held-1" },
        create: {
          id: "oi-held-1",
          orderId: order.id,
          productId: "prod-coffee",
          name: "Coffee",
          sku: "DRK-001",
          quantity: 1,
          unitPrice: 4.5,
          taxAmount: 0.37,
          total: 4.87,
        },
        update: {},
      });
    }
  }

  console.log("Seed completed successfully!");
  console.log("Demo business: Demo Market & Services");
  console.log("Demo location: Main Store");
  console.log("Employee PIN: 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
