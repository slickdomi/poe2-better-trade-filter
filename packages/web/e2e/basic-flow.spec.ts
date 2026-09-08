import { expect, test } from "@playwright/test";

test("choosing a category then a modifier narrows the pipeline and shows a chip", async ({ page }) => {
  await page.goto("/");

  const firstCategoryButton = page.locator(".category-grid button").first();
  const categoryLabel = await firstCategoryButton.textContent();
  await firstCategoryButton.click();

  await expect(page.locator(".category-chip .chip")).toHaveText(categoryLabel ?? "");

  const statInput = page.locator('input[placeholder="Search modifiers…"]');
  await statInput.click();
  await statInput.fill("");
  const firstOption = page.locator(".combobox-option").first();
  const statLabel = await firstOption.locator(".combobox-option-label").textContent();
  await firstOption.click();

  await expect(page.locator(".chosen-stats .stat-text").first()).toHaveText(statLabel ?? "");
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(2);
});

test("removing every step via Reset clears the pipeline trail", async ({ page }) => {
  await page.goto("/");
  await page.locator(".category-grid button").first().click();
  await expect(page.locator(".pipeline-trail")).toBeVisible();

  await page.click('button:has-text("Reset")');
  await expect(page.locator(".pipeline-trail")).toHaveCount(0);
  await expect(page.locator("h2", { hasText: "Item category" })).toBeVisible();
});

test("Undo last removes only the most recent step", async ({ page }) => {
  await page.goto("/");
  await page.locator(".category-grid button").first().click();
  await page.waitForTimeout(150);
  const statInput = page.locator('input[placeholder="Search modifiers…"]');
  await statInput.click();
  await page.locator(".combobox-option").first().click();
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(2);

  await page.click('button:has-text("Undo last")');
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(1);
  await expect(page.locator(".category-chip")).toBeVisible();
});

test("the affix cap toggle hides further prefixes/suffixes once 3/3 are chosen", async ({ page }) => {
  await page.goto("/");
  await page.locator(".category-grid button").first().click();
  await page.waitForTimeout(150);

  await page.check(".affix-cap-toggle input[type=checkbox]");

  const statInput = page.locator('input[placeholder="Search modifiers…"]');
  // Add up to 3 prefixes if available, tracked via the counter text.
  for (let i = 0; i < 3; i++) {
    const counts = await page.locator(".affix-counts").textContent();
    if (counts?.startsWith(" — 3/3 prefix")) break;
    await statInput.click();
    const prefixOption = page.locator(".combobox-option").filter({ has: page.locator(".affix-badge.affix-prefix") }).first();
    if ((await prefixOption.count()) === 0) break;
    await prefixOption.click();
  }
  // Whatever the final prefix count is, no more prefix options should remain once the counter reads 3/3.
  const finalCounts = await page.locator(".affix-counts").textContent();
  if (finalCounts?.includes("3/3 prefix")) {
    await statInput.click();
    await expect(page.locator(".combobox-option").filter({ has: page.locator(".affix-badge.affix-prefix") })).toHaveCount(0);
  }
});

test("the unique-only modifiers toggle changes what's available without crashing", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator(".unique-mods-toggle input[type=checkbox]");
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  // Toggling shouldn't throw or blank the page — the modifier search should still be usable.
  await expect(page.locator('input[placeholder="Search modifiers…"], input[placeholder="No more eligible modifiers"]')).toBeVisible();
});

test("the equipment doll picks a category directly and via a slot menu", async ({ page }) => {
  await page.goto("/");

  // A slot standing in for exactly one category picks it straight away.
  await page.locator('.doll-slot[aria-label="Body Armour"]').click();
  await expect(page.locator(".category-chip .chip")).toHaveText("Body Armour");

  await page.click('button:has-text("Reset")');

  // A slot covering several opens a menu instead — and Escape backs out of it.
  await page.locator('.doll-slot[aria-label="Weapon"]').click();
  await expect(page.locator(".doll-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".doll-menu")).toHaveCount(0);

  await page.locator('.doll-slot[aria-label="Weapon"]').click();
  await page.locator(".doll-menu-item", { hasText: "Crossbow" }).click();
  await expect(page.locator(".category-chip .chip")).toHaveText("Crossbow");
});
