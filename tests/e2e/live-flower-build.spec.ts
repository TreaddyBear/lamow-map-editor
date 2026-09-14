import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

async function previewHash(preview: Locator, path?: string) {
  const buffer = await preview.screenshot(path ? { path } : undefined);
  return createHash("sha256").update(buffer).digest("hex");
}

async function openAdd(page: Page, label: string) {
  await page.getByRole("button", { name: label }).first().click();
  await page.getByRole("button", { name: `Add ${label}` }).click();
}

test("builds a flower from scratch and deforms live while holding size control", async ({ page }) => {
  test.setTimeout(75_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/assets");
  await expect(page.getByTestId("asset-editor")).toBeVisible();
  const preview = page.getByTestId("vegetation-preview-board");
  await expect(preview).toBeVisible();

  while (await page.getByRole("button", { name: "Delete phrase" }).count()) {
    await page.getByRole("button", { name: "Delete phrase" }).first().click();
  }
  const emptyHash = await previewHash(preview, ".tmp/ui-flower-empty.png");

  await openAdd(page, "Grow");
  await expect(page.getByRole("button", { name: "Grow forward" })).toBeVisible();
  await page.waitForTimeout(250);
  const stemHash = await previewHash(preview, ".tmp/ui-flower-stem.png");
  expect(stemHash).not.toEqual(emptyHash);

  await openAdd(page, "Fork");
  await expect(page.getByRole("button", { name: "Fork continuations" })).toBeVisible();
  await page.waitForTimeout(250);
  const petalHash = await previewHash(preview, ".tmp/ui-flower-petals.png");
  expect(petalHash).not.toEqual(stemHash);

  await openAdd(page, "Form");
  await page.getByLabel("Primitive").selectOption("centerDisc");
  await page.waitForTimeout(250);
  const completeHash = await previewHash(preview, ".tmp/ui-flower-complete.png");
  expect(completeHash).not.toEqual(petalHash);

  await page.getByRole("button", { name: "Form saddle petal" }).first().click();
  await expect(page.getByText("Length", { exact: true })).toBeVisible();
  const lengthInput = page.getByTestId("variation-length").locator("input").first();
  const beforeHoldHash = await previewHash(preview);

  const increaseIdeal = page.getByRole("button", { name: "Increase Ideal" }).first();
  await increaseIdeal.hover();
  await page.mouse.down();

  const liveValues: string[] = [];
  for (const delay of [90, 180, 280, 420]) {
    await page.waitForTimeout(delay);
    liveValues.push(await lengthInput.inputValue());
  }
  await page.mouse.up();
  await increaseIdeal.dispatchEvent("pointerup");
  await increaseIdeal.dispatchEvent("mouseup");

  await page.waitForTimeout(250);
  const afterHoldHash = await previewHash(preview, ".tmp/ui-flower-after-size-hold.png");
  expect(afterHoldHash).not.toEqual(beforeHoldHash);
  expect(afterHoldHash).not.toEqual(emptyHash);
  expect(new Set(liveValues).size).toBeGreaterThan(1);
  expect(pageErrors).toEqual([]);
});
