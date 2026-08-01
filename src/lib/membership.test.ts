import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("membership preference scoring", () => {
  it("prefers a shared invited business over an empty My Business shell", async () => {
    const { AUTO_PROVISIONED_BUSINESS_NAME } = await import("./membership");

    type Candidate = {
      id: string;
      createdAt: Date;
      joinedAt: Date | null;
      role: { name: string };
      business: {
        name: string;
        _count: {
          products: number;
          inventoryItems: number;
          orders: number;
          employees: number;
        };
      };
    };

    function isEmptyAutoProvisionedShell(membership: Candidate): boolean {
      const { business, role } = membership;
      if (role.name !== "Owner") return false;
      if (business.name !== AUTO_PROVISIONED_BUSINESS_NAME) return false;
      return (
        business._count.products === 0 &&
        business._count.inventoryItems === 0 &&
        business._count.orders === 0 &&
        business._count.employees <= 1
      );
    }

    function membershipScore(membership: Candidate): number {
      let score = 0;
      if (!isEmptyAutoProvisionedShell(membership)) score += 100;
      if (membership.joinedAt) score += 20;
      if (membership.business.name !== AUTO_PROVISIONED_BUSINESS_NAME) score += 10;
      return score;
    }

    const shell: Candidate = {
      id: "shell",
      createdAt: new Date("2026-01-01"),
      joinedAt: null,
      role: { name: "Owner" },
      business: {
        name: AUTO_PROVISIONED_BUSINESS_NAME,
        _count: { products: 0, inventoryItems: 0, orders: 0, employees: 1 },
      },
    };

    const invited: Candidate = {
      id: "invited",
      createdAt: new Date("2026-01-02"),
      joinedAt: new Date("2026-01-03"),
      role: { name: "Cashier" },
      business: {
        name: "Austin's Shop",
        _count: { products: 12, inventoryItems: 40, orders: 3, employees: 4 },
      },
    };

    assert.ok(membershipScore(invited) > membershipScore(shell));
    assert.equal(
      [shell, invited].sort((a, b) => membershipScore(b) - membershipScore(a))[0]?.id,
      "invited"
    );
  });
});
