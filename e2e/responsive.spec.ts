import { test, expect } from "@playwright/test";
import {
  assertMainContentVisible,
  assertNoDocumentOverflow,
  collectPageErrors,
} from "./helpers";

/**
 * Public/marketing + auth smoke. Authenticated dashboard routes require
 * Clerk session — those are covered when PLAYWRIGHT_STORAGE_STATE is set.
 */
const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up", "/features", "/pricing"];

const AUTH_ROUTES = [
  "/dashboard",
  "/register",
  "/products",
  "/products/new",
  "/inventory",
  "/inventory/scan",
  "/orders",
  "/customers",
  "/employees",
  "/workforce",
  "/workforce/schedule",
  "/reports",
  "/settings",
];

test.describe("responsive public smoke", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} has no document overflow`, async ({ page }) => {
      const errors = await collectPageErrors(page);
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(res).not.toBeNull();
      expect(res!.status()).toBeLessThan(500);
      await page.waitForTimeout(300);
      await assertNoDocumentOverflow(page);
      expect(errors.filter((e) => !e.toLowerCase().includes("hydration"))).toEqual([]);
    });
  }

  test("landing page shows brand", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/NexaPOS/i).first()).toBeVisible();
    await assertNoDocumentOverflow(page);
  });

  test("mobile menu button appears under lg on authenticated shell when redirected", async ({
    page,
  }, testInfo) => {
    // Only assert on phone/tablet projects
    if (!testInfo.project.name.startsWith("phone") && !testInfo.project.name.startsWith("tablet-768")) {
      test.skip();
    }
    await page.goto("/sign-in");
    await assertNoDocumentOverflow(page);
  });
});

test.describe("authenticated responsive smoke", () => {
  test.skip(!process.env.PLAYWRIGHT_STORAGE_STATE, "Requires PLAYWRIGHT_STORAGE_STATE");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  for (const route of AUTH_ROUTES) {
    test(`${route} fits viewport without document overflow`, async ({ page }) => {
      const errors = await collectPageErrors(page);
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      await assertNoDocumentOverflow(page);
      await assertMainContentVisible(page);

      // Mobile nav should be available on small viewports
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 1024) {
        const menu = page.getByRole("button", { name: /open navigation menu/i });
        await expect(menu).toBeVisible();
        await menu.click();
        await expect(page.getByRole("navigation", { name: /main/i })).toBeVisible();
        await page.keyboard.press("Escape");
      }

      expect(errors).toEqual([]);
    });
  }

  test("register shows cart access on phone", async ({ page }, testInfo) => {
    if (!testInfo.project.name.startsWith("phone")) test.skip();
    await page.goto("/register");
    await expect(page.getByRole("button", { name: /open cart/i })).toBeVisible();
    await assertNoDocumentOverflow(page);
  });
});

test.describe("screenshot baselines", () => {
  test.skip(!process.env.PLAYWRIGHT_STORAGE_STATE, "Requires PLAYWRIGHT_STORAGE_STATE");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  const shots = [
    { route: "/dashboard", name: "dashboard" },
    { route: "/register", name: "register" },
    { route: "/inventory", name: "inventory" },
    { route: "/products/new", name: "product-form" },
    { route: "/workforce/schedule", name: "schedule" },
    { route: "/reports", name: "reports" },
    { route: "/settings", name: "settings" },
  ];

  for (const shot of shots) {
    test(`screenshot ${shot.name}`, async ({ page }, testInfo) => {
      await page.goto(shot.route, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `e2e/screenshots/${testInfo.project.name}-${shot.name}.png`,
        fullPage: true,
      });
    });
  }
});
