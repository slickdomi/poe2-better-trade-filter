import { expect, test, type Page } from "@playwright/test";

async function pickFirstCategoryAndModifier(page: Page) {
  await page.locator(".category-grid button").first().click();
  await page.waitForTimeout(150);
  await page.locator('input[placeholder="Search modifiers…"]').click();
  await page.locator(".combobox-option").first().click();
  // The modifier picker stays open for adding more — close it so it doesn't cover the rows below.
  await page.keyboard.press("Escape");
}

test("Trade is the default tab, and the Regex generator swaps the trade-only controls for a regex field", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Trade" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".trade-link-button")).toBeVisible();
  await expect(page.locator(".add-section-row")).toBeVisible();

  await page.getByRole("tab", { name: "Regex generator" }).click();
  await expect(page.getByRole("tab", { name: "Regex generator" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".trade-link-button")).toHaveCount(0);
  await expect(page.getByText("Show sellers")).toHaveCount(0);
  await expect(page.getByText("Item, requirements & equipment")).toHaveCount(0);
  await expect(page.locator(".league-select")).toHaveCount(0);
  await expect(page.locator(".add-section-row")).toHaveCount(0);

  const regexField = page.getByLabel("Generated regex");
  await expect(regexField).toHaveValue("");
  await pickFirstCategoryAndModifier(page);
  await expect(regexField).not.toHaveValue("");
});

test("each tab keeps its own selection when switching back and forth", async ({ page }) => {
  await page.goto("/");
  await pickFirstCategoryAndModifier(page);
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(2);

  await page.getByRole("tab", { name: "Regex generator" }).click();
  await expect(page.locator(".pipeline-trail")).toHaveCount(0);
  await page.locator(".category-grid button").first().click();
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(1);

  await page.getByRole("tab", { name: "Trade" }).click();
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(2);

  await page.getByRole("tab", { name: "Regex generator" }).click();
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(1);
});

test("saved regexes and saved trade queries are separate pools", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Regex generator" }).click();
  await pickFirstCategoryAndModifier(page);
  await page.fill('input[placeholder="Name this regex…"]', "My regex");
  await page.click('button:has-text("Save current")');
  await expect(page.locator(".saved-query-name")).toHaveText("My regex");

  await page.getByRole("tab", { name: "Trade" }).click();
  await expect(page.locator(".saved-query-name")).toHaveCount(0);
  await page.locator(".category-grid button").first().click();
  await page.fill('input[placeholder="Name this query…"]', "My trade query");
  await page.click('button:has-text("Save current")');
  await expect(page.locator(".saved-query-name")).toHaveText("My trade query");

  await page.getByRole("tab", { name: "Regex generator" }).click();
  await expect(page.locator(".saved-query-name")).toHaveText("My regex");
});

test("a shared link reopens the Regex generator tab with the same selection and regex", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Regex generator" }).click();
  await pickFirstCategoryAndModifier(page);
  const regex = await page.getByLabel("Generated regex").inputValue();
  expect(regex).not.toBe("");
  await page.waitForTimeout(800); // past the 600ms debounce

  const sharedUrl = page.url();
  expect(new URL(sharedUrl).searchParams.get("tab")).toBe("regex");
  expect(new URL(sharedUrl).searchParams.get("r")).not.toBeNull();
  // The untouched Trade tab stays out of the link, so it can't override the recipient's own defaults.
  expect(new URL(sharedUrl).searchParams.get("f")).toBeNull();

  await page.goto("about:blank");
  await page.goto(sharedUrl);
  await expect(page.getByRole("tab", { name: "Regex generator" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Generated regex")).toHaveValue(regex);
  await expect(page.locator(".pipeline-trail ol li")).toHaveCount(2);
});

test("browser back returns to the previously open tab, with its selection intact", async ({ page }) => {
  await page.goto("/");
  await page.locator(".category-grid button").first().click();
  await page.waitForTimeout(800);
  await page.getByRole("tab", { name: "Regex generator" }).click();
  await page.waitForTimeout(800);
  expect(new URL(page.url()).searchParams.get("tab")).toBe("regex");

  await page.goBack();
  await expect(page.getByRole("tab", { name: "Trade" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".category-chip")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("tab")).toBeNull();
});

test("the modifier search finds a modifier from a few partial words in any order", async ({ page }) => {
  await page.goto("/");
  await page.locator(".category-grid button").first().click();
  const statInput = page.locator('input[placeholder="Search modifiers…"]');
  await statInput.click();

  // Take a modifier with at least two real words, and search for the first
  // three letters of two of them, back to front: "Accuracy Rating" → "rat acc".
  const labels = await page.locator(".combobox-option-label").allTextContents();
  const label = labels.find((l) => (l.match(/[a-z]{4,}/gi) ?? []).length >= 2)!;
  const [first, second] = label.match(/[a-z]{4,}/gi)!;
  await statInput.fill(`${second.slice(0, 3)} ${first.slice(0, 3)}`);

  await expect(page.locator(".combobox-option-label", { hasText: label }).first()).toBeVisible();
});

test("an unticked modifier stays listed but is left out of the regex until ticked again", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Regex generator" }).click();
  await pickFirstCategoryAndModifier(page);
  const regexField = page.getByLabel("Generated regex");
  const regex = await regexField.inputValue();
  expect(regex).not.toBe("");

  const toggle = page.locator(".chosen-stat-toggle").first();
  await toggle.uncheck();
  await expect(regexField).toHaveValue("");
  await expect(page.locator(".chosen-stats .stat-text")).toHaveCount(1);
  await expect(page.locator(".chosen-stats li.chosen-stat-disabled")).toHaveCount(1);

  await toggle.check();
  await expect(regexField).toHaveValue(regex);
});
