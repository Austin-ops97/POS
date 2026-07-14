/**
 * Integration-style barcode/product tests (require DATABASE_URL).
 * Covers tenant isolation, duplicate rejection, and scan-session apply-once.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { normalizeBarcode } from "./barcodes";
import { syncProductPrimaryBarcode, findBarcodeAssignment } from "./product-barcode";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("barcode product assignments", { skip: !hasDatabase }, () => {
  const db = new PrismaClient();
  const businessIds: string[] = [];
  const userIds: string[] = [];

  before(async () => {
    const { ensureRolesAndPermissions } = await import("./roles-permissions");
    await ensureRolesAndPermissions(db);
  });

  after(async () => {
    for (const businessId of businessIds) {
      await db.productBarcode.deleteMany({ where: { businessId } });
      await db.inventoryMovement.deleteMany({ where: { businessId } });
      await db.inventoryScanLine.deleteMany({
        where: { session: { businessId } },
      });
      await db.inventoryScanSession.deleteMany({ where: { businessId } });
      await db.inventoryItem.deleteMany({ where: { businessId } });
      await db.product.deleteMany({ where: { businessId } });
      await db.employeeLocation.deleteMany({
        where: { employee: { businessId } },
      });
      await db.employeeProfile.deleteMany({ where: { businessId } });
      await db.location.deleteMany({ where: { businessId } });
      await db.businessSetting.deleteMany({ where: { businessId } });
      await db.moduleSetting.deleteMany({ where: { businessId } });
      await db.barcodeMigrationConflict.deleteMany({ where: { businessId } });
      await db.business.deleteMany({ where: { id: businessId } });
    }
    for (const userId of userIds) {
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.$disconnect();
  });

  async function seedBusiness(suffix: string) {
    const { provisionBusinessForLocalUser } = await import("./provision-business");
    const user = await db.user.create({
      data: {
        clerkId: `barcode-test-${suffix}-${Date.now()}-${Math.random()}`,
        email: `barcode-${suffix}-${Date.now()}@test.nexapos.local`,
        firstName: "Barcode",
        lastName: "Tester",
      },
    });
    userIds.push(user.id);
    const result = await provisionBusinessForLocalUser(user);
    businessIds.push(result.businessId);
    return result;
  }

  it("exact local match and UPC/EAN equivalence within a business", async () => {
    const seeded = await seedBusiness("match");
    const product = await db.product.create({
      data: {
        businessId: seeded.businessId,
        name: "Test Cola",
        price: 1.99,
        barcode: "036000291452",
        trackInventory: true,
      },
    });
    await syncProductPrimaryBarcode(db, {
      businessId: seeded.businessId,
      productId: product.id,
      barcode: "036000291452",
    });

    const upc = normalizeBarcode("036000291452");
    const ean = normalizeBarcode("0036000291452");
    const byUpc = await findBarcodeAssignment(db, seeded.businessId, upc);
    const byEan = await findBarcodeAssignment(db, seeded.businessId, ean);
    assert.ok(byUpc);
    assert.equal(byUpc!.productId, product.id);
    assert.equal(byEan!.productId, product.id);
  });

  it("rejects duplicate barcodes within the same business", async () => {
    const seeded = await seedBusiness("dup");
    const a = await db.product.create({
      data: {
        businessId: seeded.businessId,
        name: "A",
        price: 1,
        trackInventory: false,
      },
    });
    const b = await db.product.create({
      data: {
        businessId: seeded.businessId,
        name: "B",
        price: 2,
        trackInventory: false,
      },
    });
    await syncProductPrimaryBarcode(db, {
      businessId: seeded.businessId,
      productId: a.id,
      barcode: "4006381333931",
    });
    await assert.rejects(
      () =>
        syncProductPrimaryBarcode(db, {
          businessId: seeded.businessId,
          productId: b.id,
          barcode: "4006381333931",
        }),
      /already assigned/i
    );
  });

  it("isolates barcodes across tenants", async () => {
    const one = await seedBusiness("t1");
    const two = await seedBusiness("t2");
    const product = await db.product.create({
      data: {
        businessId: one.businessId,
        name: "Private",
        price: 5,
        trackInventory: false,
      },
    });
    await syncProductPrimaryBarcode(db, {
      businessId: one.businessId,
      productId: product.id,
      barcode: "96385074",
    });
    const barcode = normalizeBarcode("96385074");
    const other = await findBarcodeAssignment(db, two.businessId, barcode);
    assert.equal(other, null);
  });

  it("applies a receive scan session exactly once", async () => {
    const seeded = await seedBusiness("session");
    const location = await db.location.findFirstOrThrow({
      where: { businessId: seeded.businessId },
    });
    const product = await db.product.create({
      data: {
        businessId: seeded.businessId,
        name: "Recv Item",
        price: 3,
        trackInventory: true,
        barcode: "036000291452",
      },
    });
    await syncProductPrimaryBarcode(db, {
      businessId: seeded.businessId,
      productId: product.id,
      barcode: "036000291452",
    });
    const item = await db.inventoryItem.create({
      data: {
        businessId: seeded.businessId,
        locationId: location.id,
        productId: product.id,
        quantityOnHand: 5,
      },
    });

    const session = await db.inventoryScanSession.create({
      data: {
        businessId: seeded.businessId,
        locationId: location.id,
        employeeId: seeded.employeeId,
        mode: "RECEIVE",
        idempotencyKey: `recv-once-${Date.now()}`,
        lines: {
          create: {
            productId: product.id,
            inventoryItemId: item.id,
            normalizedCode: "00036000291452",
            expectedQty: 5,
            scannedQty: 2,
            proposedDelta: 2,
          },
        },
      },
    });

    // Simulate apply transaction twice (idempotent status guard)
    await db.$transaction(async (tx) => {
      const locked = await tx.inventoryScanSession.findFirst({
        where: { id: session.id },
        include: { lines: true },
      });
      assert.equal(locked?.status, "OPEN");
      for (const line of locked!.lines) {
        const inv = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: line.inventoryItemId },
        });
        const newQty = inv.quantityOnHand + line.proposedDelta;
        await tx.inventoryItem.update({
          where: { id: inv.id },
          data: { quantityOnHand: newQty },
        });
        await tx.inventoryMovement.create({
          data: {
            businessId: seeded.businessId,
            inventoryItemId: inv.id,
            type: "RECEIVED",
            quantity: line.proposedDelta,
            previousQty: inv.quantityOnHand,
            newQty,
            referenceId: session.id,
            employeeId: seeded.employeeId,
          },
        });
      }
      await tx.inventoryScanSession.update({
        where: { id: session.id },
        data: { status: "APPLIED", appliedAt: new Date() },
      });
    });

    const after = await db.inventoryItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    assert.equal(after.quantityOnHand, 7);

    const applied = await db.inventoryScanSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    assert.equal(applied.status, "APPLIED");

    const movements = await db.inventoryMovement.count({
      where: { referenceId: session.id },
    });
    assert.equal(movements, 1);
  });
});
