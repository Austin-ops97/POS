import { expect, type Page } from "@playwright/test";

/** Document-level horizontal overflow (bounded table scroll is OK). */
export async function assertNoDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(overflow, "document should not scroll horizontally").toBe(false);
}

export async function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore expected Clerk/dev noise when unauthenticated
      if (
        text.includes("Clerk") ||
        text.includes("Failed to load resource") ||
        text.includes("net::ERR_")
      ) {
        return;
      }
      errors.push(text);
    }
  });
  return errors;
}

export async function assertMainContentVisible(page: Page) {
  const main = page.locator("main").first();
  if ((await main.count()) === 0) return;
  await expect(main).toBeVisible();
  const box = await main.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(40);
}
