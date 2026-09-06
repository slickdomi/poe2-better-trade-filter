import { expect, test } from "@playwright/test";

test("choosing a filter encodes it into the URL after the debounce settles", async ({ page }) => {
  await page.goto("/");
  expect(new URL(page.url()).searchParams.get("f")).toBeNull();

  await page.locator(".category-grid button").first().click();
  await page.waitForTimeout(800); // past the 600ms debounce

  expect(new URL(page.url()).searchParams.get("f")).not.toBeNull();
});

test("opening a URL with an `f` param restores that exact state on a fresh load", async ({ page }) => {
  await page.goto("/");
  const firstCategoryButton = page.locator(".category-grid button").first();
  const categoryLabel = await firstCategoryButton.textContent();
  await firstCategoryButton.click();
  await page.waitForTimeout(800);
  const sharedUrl = page.url();

  await page.goto("about:blank");
  await page.goto(sharedUrl);
  await page.waitForTimeout(200);

  await expect(page.locator(".category-chip .chip")).toHaveText(categoryLabel ?? "");
});

test("browser back/forward steps through pipeline history", async ({ page }) => {
  await page.goto("/");
  await page.locator(".category-grid button").first().click();
  await page.waitForTimeout(800);

  const statInput = page.locator('input[placeholder="Search modifiers…"]');
  await statInput.click();
  await page.locator(".combobox-option").first().click();
  await page.waitForTimeout(800);
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(2);

  await page.goBack();
  await page.waitForTimeout(200);
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(1);

  await page.goForward();
  await page.waitForTimeout(200);
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(2);
});

test("a garbage `f` param is ignored rather than crashing the app", async ({ page }) => {
  await page.goto("/?f=not-valid-gzip-base64-data");
  await page.waitForTimeout(200);
  await expect(page.locator("h2", { hasText: "Item category" })).toBeVisible();
});
