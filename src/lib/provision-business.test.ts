import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { MODULE_SETTING_KEYS } from "./validations";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

describe("automatic business provisioning", { skip: !hasDatabase }, () => {
  const db = new PrismaClient();
  const createdUserIds: string[] = [];
  const createdBusinessIds: string[] = [];

  before(async () => {
    const { ensureRolesAndPermissions } = await import("./roles-permissions");
    await ensureRolesAndPermissions(db);
  });

  after(async () => {
    for (const businessId of createdBusinessIds) {
      await db.employeeLocation.deleteMany({
        where: { employee: { businessId } },
      });
      await db.employeeProfile.deleteMany({ where: { businessId } });
      await db.taxRate.deleteMany({ where: { businessId } });
      await db.moduleSetting.deleteMany({ where: { businessId } });
      await db.businessSetting.deleteMany({ where: { businessId } });
      await db.workforceSettings.deleteMany({ where: { businessId } });
      await db.stripeAccount.deleteMany({ where: { businessId } });
      await db.location.deleteMany({ where: { businessId } });
      await db.business.deleteMany({ where: { id: businessId } });
    }
    for (const userId of createdUserIds) {
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.$disconnect();
  });

  async function createTestUser(suffix: string) {
    const user = await db.user.create({
      data: {
        clerkId: `provision-test-${suffix}-${Date.now()}-${Math.random()}`,
        email: `provision-${suffix}-${Date.now()}@test.nexapos.local`,
        firstName: "Prov",
        lastName: "Tester",
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  it("returns existing business for an existing employee", async () => {
    const { provisionBusinessForLocalUser } = await import("./provision-business");
    const user = await createTestUser("existing");
    const first = await provisionBusinessForLocalUser(user);
    createdBusinessIds.push(first.businessId);

    const second = await provisionBusinessForLocalUser(user);
    assert.equal(second.created, false);
    assert.equal(second.businessId, first.businessId);
    assert.equal(second.employeeId, first.employeeId);
  });

  it("provisions a complete unlocked business for a new user", async () => {
    const { provisionBusinessForLocalUser } = await import("./provision-business");
    const user = await createTestUser("new");
    const result = await provisionBusinessForLocalUser(user);
    createdBusinessIds.push(result.businessId);

    assert.equal(result.created, true);

    const business = await db.business.findUniqueOrThrow({
      where: { id: result.businessId },
      include: {
        locations: true,
        settings: true,
        workforceSettings: true,
        moduleSettings: true,
        stripeAccount: true,
        taxRates: true,
        employees: {
          include: {
            role: true,
            locations: true,
          },
        },
      },
    });

    assert.equal(business.name, "My Business");
    assert.equal(business.type, "HYBRID");
    assert.equal(business.email, user.email);

    assert.equal(business.locations.length, 1);
    assert.equal(business.locations[0].name, "Main Location");
    assert.equal(business.locations[0].isDefault, true);
    assert.equal(business.locations[0].timezone, "America/Chicago");
    assert.equal(result.locationId, business.locations[0].id);

    const owner = business.employees[0];
    assert.ok(owner);
    assert.equal(owner.role.name, "Owner");
    assert.equal(owner.userId, user.id);
    assert.equal(owner.defaultLocationId, business.locations[0].id);
    assert.equal(owner.locations.length, 1);
    assert.equal(owner.locations[0].locationId, business.locations[0].id);

    assert.ok(business.settings);
    assert.equal(business.settings!.enableCash, true);
    assert.equal(business.settings!.enableCard, true);
    assert.equal(business.settings!.enableManualDiscount, true);
    assert.equal(business.settings!.allowCustomItems, true);
    assert.equal(business.settings!.enableBarcodeScanning, true);
    assert.equal(business.settings!.enableReceiptPrinting, true);
    assert.equal(business.settings!.requireCustomer, false);
    assert.equal(business.settings!.requirePinAtRegister, false);

    assert.ok(business.workforceSettings);

    const moduleKeys = business.moduleSettings.map((m) => m.module).sort();
    assert.deepEqual(moduleKeys, [...MODULE_SETTING_KEYS].sort());
    assert.ok(business.moduleSettings.every((m) => m.enabled));

    assert.ok(business.stripeAccount);
    assert.equal(business.stripeAccount!.status, "NOT_CONNECTED");
    assert.equal(business.stripeAccount!.stripeAccountId, null);

    assert.equal(business.taxRates.length, 1);
    assert.equal(Number(business.taxRates[0].rate), 0);

    // No Subscription model/table — verify via raw query that none exists for this business
    const tables = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Subscription'
      ) AS exists
    `;
    if (tables[0]?.exists) {
      const subs = await db.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM "Subscription" WHERE "businessId" = $1`,
        result.businessId
      );
      assert.equal(Number(subs[0].count), 0);
    }
  });

  it("is idempotent under concurrent provisioning", async () => {
    const { provisionBusinessForLocalUser } = await import("./provision-business");
    const user = await createTestUser("concurrent");

    const [a, b, c] = await Promise.all([
      provisionBusinessForLocalUser(user),
      provisionBusinessForLocalUser(user),
      provisionBusinessForLocalUser(user),
    ]);
    createdBusinessIds.push(a.businessId, b.businessId, c.businessId);

    const uniqueBusinessIds = new Set([a.businessId, b.businessId, c.businessId]);
    assert.equal(uniqueBusinessIds.size, 1);

    const employees = await db.employeeProfile.findMany({
      where: { userId: user.id, deletedAt: null },
    });
    assert.equal(employees.length, 1);

    const businesses = await db.business.findMany({
      where: { id: { in: [...uniqueBusinessIds] } },
    });
    assert.equal(businesses.length, 1);
  });

  it("does not gate advanced reports, terminal, employees, or locations by plan", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const libDir = path.join(process.cwd(), "src/lib");
    assert.equal(fs.existsSync(path.join(libDir, "subscription-access.ts")), false);
    assert.equal(fs.existsSync(path.join(libDir, "subscription-server.ts")), false);
  });
});

describe("module key normalization", () => {
  it("normalizes legacy lowercase aliases to canonical keys", async () => {
    const { normalizeModuleKey, defaultEnabledModules } = await import("./modules");
    assert.equal(normalizeModuleKey("retail"), "RETAIL");
    assert.equal(normalizeModuleKey("SERVICE"), "SERVICE");
    assert.equal(normalizeModuleKey("inventory"), "RETAIL");
    const defaults = defaultEnabledModules();
    assert.ok(defaults.every((m) => m.enabled));
    assert.deepEqual(
      defaults.map((m) => m.module).sort(),
      [...MODULE_SETTING_KEYS].sort()
    );
  });
});
