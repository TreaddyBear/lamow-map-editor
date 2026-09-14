import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { selectAsset, exportAsset } from "./asset-actions";
import { previewState } from "./preview-state";
const coverage = (page: Page) => page.locator("label").filter({ hasText: "100% coverage · plants/m²" }).locator("input");
async function edit(page: Page, value: string) { await coverage(page).fill(value); await coverage(page).blur(); }
async function exported(page: Page) { const wait = page.waitForEvent("download"); await exportAsset(page); return JSON.parse(await readFile((await (await wait).path())!, "utf8")); }

test("Undo and Redo stay with each asset, and sidebar numbers never overlap their labels", async ({ page }) => {
  await page.goto("/assets");
  await edit(page, "40"); await selectAsset(page, "flowerWhite");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await edit(page, "55"); await selectAsset(page, "flowerBlue");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(coverage(page)).toHaveValue("25"); await expect(page.getByTestId("asset-selector")).toHaveAttribute("data-species-id", "flowerBlue");
  await selectAsset(page, "flowerWhite"); await expect(coverage(page)).toHaveValue("55");
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(coverage(page)).toHaveValue("25");
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(coverage(page)).toHaveValue("55");
  await selectAsset(page, "flowerBlue"); await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(coverage(page)).toHaveValue("40");
  await page.getByRole("button", { name: "Grow stem", exact: true }).click();
  const left = (await page.getByTestId("asset-species-panel-body").boundingBox())!, right = (await page.getByTestId("asset-inspector-panel-body").boundingBox())!;
  expect(left.x).toBeLessThan(right.x);
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const field of await page.locator('fieldset[data-testid^="variation-"]').all()) {
      const label = (await field.locator(":scope > div").first().boundingBox())!;
      for (const input of await field.locator("input").all()) {
        const box = (await input.boundingBox())!; expect(box.y).toBeGreaterThanOrEqual(label.y + label.height);
        expect(box.width).toBeGreaterThan(50);
      }
    }
  }
  await page.screenshot({ path: ".tmp/editor-corrected-layout.png" });
});

test("right-click insertion is contextual and the inspector has no duplicate Add panels", async ({ page }) => {
  await page.goto("/assets");
  await expect(page.getByTestId("asset-inspector-panel-body").getByRole("button", { name: "Grow", exact: true })).toHaveCount(0);
  const original = await exported(page), roots = original.species.constructionRecipe.root;
  const fork = roots.find((phrase: any) => phrase.type === "fork"), grow = roots.find((phrase: any) => phrase.type === "continue");
  await page.getByTestId(`phrase-row-${fork.id}`).click({ button: "right" });
  await expect(page.getByTestId(`phrase-row-${fork.id}`)).toHaveAttribute("data-selected", "true");
  await page.getByRole("menuitem", { name: "Add inside", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Form", exact: true }).click();
  let asset = await exported(page);
  expect(asset.species.constructionRecipe.root.find((phrase: any) => phrase.id === fork.id).continuation).toHaveLength(fork.continuation.length + 1);
  await page.getByTestId(`phrase-row-${grow.id}`).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Add inside", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Add before", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Grow", exact: true }).click();
  asset = await exported(page);
  expect(asset.species.constructionRecipe.root[1].id).toBe(grow.id);
  await page.getByTestId(`phrase-row-${grow.id}`).click({ button: "right" });
  await page.screenshot({ path: ".tmp/recipe-context-menu.png" });
});

test("right-drag pans without orbiting; reset waits for a small confirmation", async ({ page }) => {
  await page.goto("/assets"); await expect(page.getByTestId("vegetation-preview-board")).toHaveAttribute("data-update-ms", /\d/);
  const before = (await previewState(page)).camera;
  const box = (await page.getByTestId("preview-plant").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "right" }); await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 25, { steps: 5 }); await page.mouse.up({ button: "right" });
  const moved = (await previewState(page)).camera;
  expect(moved.slice(0, 3)).toEqual(before.slice(0, 3)); expect(moved.slice(3)).not.toEqual(before.slice(3));
  await page.getByRole("button", { name: "Reset Plant view", exact: true }).click();
  expect((await previewState(page)).camera).toEqual(moved);
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); expect((await previewState(page)).camera).toEqual(moved);
  await page.getByRole("button", { name: "Reset Plant view", exact: true }).click(); await page.getByRole("button", { name: "Reset", exact: true }).click();
  expect((await previewState(page)).camera.slice(3)).toEqual(before.slice(3));
});

test("mixed slats use opaque world-space stripes and dots without rebuilding geometry", async ({ page }) => {
  await page.goto("/assets"); await page.getByText("Slat editor", { exact: true }).click();
  const color = page.locator("label").filter({ hasText: "Vegetation slat color" }).locator("input").last(); await color.fill("#ff0000"); await color.blur();
  const strength = page.locator("label").filter({ hasText: "Vegetation slat strength" }).locator("input"); await strength.fill("1"); await strength.blur();
  await page.waitForTimeout(200);
  const before = (await previewState(page)).grass;
  expect(before.every(layer => layer.alpha === 1 && !layer.blending)).toBe(true);
  expect(before[0].floats.vegetationCoverage).toBe(0.5);
  const stripes = await page.getByTestId("preview-lod-half").screenshot();
  await page.getByRole("combobox", { name: "Coverage pattern", exact: true }).selectOption("dots");
  await expect.poll(async () => (await previewState(page)).grass[0].floats.patternMode).toBe(1);
  const dots = await page.getByTestId("preview-lod-half").screenshot(); expect(dots.equals(stripes)).toBe(false);
  expect((await previewState(page)).grass.map(layer => layer.geometry)).toEqual(before.map(layer => layer.geometry));
  await page.getByRole("combobox", { name: "Coverage pattern", exact: true }).selectOption("stripes");
  await page.screenshot({ path: ".tmp/opaque-slat-coverage.png" });
});
