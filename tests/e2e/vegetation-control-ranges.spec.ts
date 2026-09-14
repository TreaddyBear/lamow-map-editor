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

async function deleteAllPhrases(page: Page) {
  while (await page.getByRole("button", { name: "Delete phrase" }).count()) {
    await page.getByRole("button", { name: "Delete phrase" }).first().click();
  }
}

async function setIdeal(page: Page, fieldId: string, value: string) {
  const input = page.getByTestId(`variation-${fieldId}`).locator("input").first();
  await input.fill(value);
  await input.blur();
}

async function holdIdeal(
  page: Page,
  preview: Locator,
  fieldId: string,
  {
    direction = 1,
    min,
    max,
    maxDelta,
    expectVisualChange = true,
    snapshotPath,
  }: {
    direction?: -1 | 1;
    min?: number;
    max?: number;
    maxDelta: number;
    expectVisualChange?: boolean;
    snapshotPath?: string;
  },
) {
  const field = page.getByTestId(`variation-${fieldId}`);
  await expect(field).toBeVisible();
  const input = field.locator("input").first();
  const button = field.getByRole("button", { name: direction > 0 ? "Increase Ideal" : "Decrease Ideal" });
  const beforeValue = Number(await input.inputValue());
  const shouldCapture = expectVisualChange || snapshotPath !== undefined;
  const beforeHash = shouldCapture ? await previewHash(preview) : undefined;

  await button.hover();
  await page.mouse.down();

  const liveValues: number[] = [];
  for (const delay of [80, 120, 160]) {
    await page.waitForTimeout(delay);
    liveValues.push(Number(await input.inputValue()));
  }
  await page.mouse.up();
  await button.dispatchEvent("pointerup");
  await button.dispatchEvent("mouseup");
  await page.waitForTimeout(180);

  const afterValue = Number(await input.inputValue());
  const afterHash = shouldCapture ? await previewHash(preview, snapshotPath) : undefined;
  const delta = Math.abs(afterValue - beforeValue);

  expect(liveValues.some((value) => direction > 0 ? value > beforeValue : value < beforeValue)).toBe(true);
  expect(delta).toBeGreaterThan(0);
  expect(delta).toBeLessThanOrEqual(maxDelta);
  if (min !== undefined) expect(afterValue).toBeGreaterThanOrEqual(min);
  if (max !== undefined) expect(afterValue).toBeLessThanOrEqual(max);
  if (expectVisualChange) expect(afterHash).not.toEqual(beforeHash);

  return { beforeValue, afterValue, liveValues };
}

test("vegetation recipe controls use sane ranges and update the Babylon preview live", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/assets");
  await expect(page.getByTestId("asset-editor")).toBeVisible();

  const preview = page.getByTestId("vegetation-preview-board");
  await expect(preview).toBeVisible();
  const canvas = await preview.elementHandle();
  expect(canvas).not.toBeNull();
  await canvas!.evaluate((element) => {
    (element as HTMLElement).dataset.stabilityMarker = "vegetation-range-test";
  });

  await deleteAllPhrases(page);
  const emptyHash = await previewHash(preview);

  await openAdd(page, "Form");
  await page.getByLabel("Primitive").selectOption("centerDisc");
  await page.waitForTimeout(220);
  const centerHash = await previewHash(preview, ".tmp/ui-range-center-root.png");
  expect(centerHash).not.toEqual(emptyHash);
  await holdIdeal(page, preview, "length", { max: 0.18, maxDelta: 0.1, snapshotPath: ".tmp/ui-range-center-after-hold.png" });

  await deleteAllPhrases(page);
  await openAdd(page, "Grow");
  await expect(page.getByRole("button", { name: "Grow forward" })).toBeVisible();
  await holdIdeal(page, preview, "distance", { min: 0, max: 0.8, maxDelta: 0.08 });
  await expect(page.getByTestId("variation-arc-degrees")).toBeVisible();
  await expect(page.getByTestId("variation-arc-direction")).toBeVisible();
  await holdIdeal(page, preview, "arc-degrees", { min: 0, max: 180, maxDelta: 18, expectVisualChange: false });
  await expect(page.getByTestId("variation-start-radius")).toBeVisible();
  await expect(page.getByTestId("variation-end-radius")).toBeVisible();

  await openAdd(page, "Fork");
  await expect(page.getByRole("button", { name: "Fork continuations" })).toBeVisible();
  await holdIdeal(page, preview, "count", { min: 1, max: 64, maxDelta: 18 });
  await setIdeal(page, "count", "8");
  await expect(page.getByTestId("variation-spread-degrees")).toBeVisible();
  await expect(page.getByTestId("variation-radius")).toBeVisible();

  await page.getByRole("button", { name: "Form saddle petal" }).first().click();
  await holdIdeal(page, preview, "length", { min: 0, max: 0.22, maxDelta: 0.08, snapshotPath: ".tmp/ui-range-petal-after-hold.png" });
  await expect(page.getByTestId("variation-width")).toBeVisible();
  await expect(page.getByTestId("variation-cup")).toBeVisible();
  await expect(page.getByTestId("variation-curl")).toBeVisible();

  await openAdd(page, "Branch");
  await expect(page.getByRole("button", { name: "Branch offshoot" })).toBeVisible();
  await holdIdeal(page, preview, "offshoot-count", { min: 1, max: 64, maxDelta: 18, expectVisualChange: false });
  await expect(page.getByTestId("variation-deviation-angle")).toBeVisible();
  await expect(page.getByTestId("variation-around-axis")).toBeVisible();

  await page.getByRole("button", { name: "Form leaf blade" }).first().click();
  await expect(page.getByTestId("variation-cup")).toBeVisible();
  await expect(page.getByTestId("variation-curl")).toBeVisible();
  await expect(page.getByTestId("variation-length")).toBeVisible();
  await expect(page.getByTestId("variation-width")).toBeVisible();

  await page.getByLabel("Primitive").selectOption("quadSlat");
  await expect(page.getByTestId("variation-length").locator("input").first()).toHaveValue("1.25");
  await expect(page.getByTestId("variation-width").locator("input").first()).toHaveValue("0.18");
  await page.getByLabel("Primitive").selectOption("centerDisc");
  await expect(page.getByTestId("variation-length").locator("input").first()).toHaveValue("0.05");
  await expect(page.getByTestId("variation-width").locator("input").first()).toHaveValue("0.05");

  await previewHash(preview, ".tmp/ui-range-complete.png");
  await expect(page.getByTestId("vegetation-preview-board")).toHaveCount(1);
  await expect(preview).toHaveJSProperty("isConnected", true);
  await expect(preview).toHaveAttribute("data-stability-marker", "vegetation-range-test");
  expect(pageErrors).toEqual([]);
});
