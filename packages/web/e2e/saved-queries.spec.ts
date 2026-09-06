import { expect, test, type Page } from "@playwright/test";

async function saveQueryNamed(page: Page, name: string) {
  await page.fill('input[placeholder="Name this query…"]', name);
  await page.click('button:has-text("Save current")');
  await page.waitForTimeout(100);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator(".category-grid button").first().click();
  await page.waitForTimeout(150);
});

test("saving a query adds it to the list, and Load restores it after Reset", async ({ page }) => {
  const categoryLabel = await page.locator(".category-chip .chip").textContent();
  await saveQueryNamed(page, "My saved search");

  await expect(page.locator(".saved-query-name")).toHaveText("My saved search");

  await page.click('button:has-text("Reset")');
  await expect(page.locator(".category-chip")).toHaveCount(0);

  await page.locator(".saved-query-item", { hasText: "My saved search" }).locator('button:has-text("Load")').click();
  await expect(page.locator(".category-chip .chip")).toHaveText(categoryLabel ?? "");
});

test("deleting a saved query removes it", async ({ page }) => {
  await saveQueryNamed(page, "Delete me");
  await expect(page.locator(".saved-query-name")).toHaveCount(1);
  await page.locator(".saved-query-item .saved-query-actions button", { hasText: "Delete" }).click();
  await expect(page.locator(".saved-query-name")).toHaveCount(0);
});

test("creating a folder and dragging a saved query into it moves the query there", async ({ page }) => {
  await saveQueryNamed(page, "Query A");

  page.once("dialog", (d) => d.accept("Weapons"));
  await page.click('button:has-text("+ New folder")');
  await page.waitForTimeout(150);

  const queryHandle = page.locator(".saved-query-item", { hasText: "Query A" }).locator(".drag-handle");
  const folderHeader = page.locator(".saved-folder-header", { hasText: "Weapons" });
  await queryHandle.dragTo(folderHeader);
  await page.waitForTimeout(200);

  // The query should now render nested inside the folder's own subtree, not directly under the root list.
  await expect(page.locator(".saved-queries-root > .saved-query-item", { hasText: "Query A" })).toHaveCount(0);
  await expect(page.locator(".saved-query-folder", { hasText: "Weapons" }).locator(".saved-query-item", { hasText: "Query A" })).toHaveCount(1);
});

test("the top-level drop zone appears once a folder exists and moves a nested query back out", async ({ page }) => {
  await saveQueryNamed(page, "Query A");
  page.once("dialog", (d) => d.accept("Weapons"));
  await page.click('button:has-text("+ New folder")');
  await page.waitForTimeout(150);

  await expect(page.locator(".saved-queries-outdent")).toHaveCount(1); // exists once a folder is present

  const queryHandle = page.locator(".saved-query-item", { hasText: "Query A" }).locator(".drag-handle");
  const folderHeader = page.locator(".saved-folder-header", { hasText: "Weapons" });
  await queryHandle.dragTo(folderHeader);
  await page.waitForTimeout(200);

  const queryHandleNested = page.locator(".saved-query-item", { hasText: "Query A" }).locator(".drag-handle");
  await queryHandleNested.dragTo(page.locator(".saved-queries-outdent"));
  await page.waitForTimeout(200);

  await expect(page.locator(".saved-queries-root > .saved-query-item", { hasText: "Query A" })).toHaveCount(1);
});

test("nesting a folder into itself via drag is refused (no visible change)", async ({ page }) => {
  page.once("dialog", (d) => d.accept("Solo"));
  await page.click('button:has-text("+ New folder")');
  await page.waitForTimeout(150);

  const handle = page.locator(".saved-folder-header", { hasText: "Solo" }).locator(".drag-handle");
  const ownHeader = page.locator(".saved-folder-header", { hasText: "Solo" });
  await handle.dragTo(ownHeader);
  await page.waitForTimeout(150);

  // Still exactly one top-level folder named Solo — the no-op didn't duplicate or nest it under itself.
  await expect(page.locator(".saved-queries-root > .saved-query-folder", { hasText: "Solo" })).toHaveCount(1);
});

test("export then import round-trips a saved query", async ({ page }) => {
  await saveQueryNamed(page, "Exported one");

  const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Export…")')]);
  const path = await download.path();
  expect(path).toBeTruthy();

  // Clear local data (simulating a fresh browser), then import the downloaded file back in.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".saved-query-name")).toHaveCount(0);

  await page.setInputFiles('input[type="file"]', path!);
  await page.waitForTimeout(200);
  await expect(page.locator(".saved-query-name")).toHaveText("Exported one");
});

test("importing an invalid file shows an error instead of crashing", async ({ page }) => {
  const buffer = Buffer.from(JSON.stringify({ not: "a valid export" }));
  await page.setInputFiles('input[type="file"]', { name: "bad.json", mimeType: "application/json", buffer });
  await page.waitForTimeout(150);
  await expect(page.locator(".saved-queries .error")).toBeVisible();
});
