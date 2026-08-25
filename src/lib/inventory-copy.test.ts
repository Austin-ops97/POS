import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SERVICE_PRODUCTS_INVENTORY_NOTE, SERVICE_PRODUCTS_INVENTORY_SEARCH_HINT } from "./inventory-copy";

describe("inventory service product copy", () => {
  it("uses the application Service product terminology", () => {
    assert.equal(
      SERVICE_PRODUCTS_INVENTORY_NOTE,
      "Service products are always available and are not tracked as physical inventory."
    );
    assert.match(SERVICE_PRODUCTS_INVENTORY_SEARCH_HINT, /Service products/i);
  });

  it("renders the explanatory note next to Inventory search", () => {
    const source = readFileSync("src/components/dashboard/inventory-table.tsx", "utf8");
    assert.match(source, /SERVICE_PRODUCTS_INVENTORY_NOTE/);
    assert.match(source, /data-testid="service-products-inventory-note"/);
    assert.match(source, /Search inventory/);
  });
});
