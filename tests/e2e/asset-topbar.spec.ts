import { expect, test } from "@playwright/test";
import { selectAsset, renameAsset } from "./asset-actions";

test("clean headers stay quiet; dirty autosave sits before the asset and survives reopening", async ({ page }) => {
  await page.goto("/assets");
  const bar = page.getByTestId("asset-topbar"), selector = page.getByTestId("asset-selector"), autosave = page.getByTestId("asset-autosave");
  await expect(bar.locator("button").first()).toHaveAttribute("aria-label", "App menu");
  await selectAsset(page, "flowerWhite");
  await expect(page.getByTestId("asset-version-trigger")).toHaveText("v1");
  await expect(autosave).toHaveCount(0);
  await renameAsset(page, "Meadow flower");
  await expect(page.getByTestId("asset-version-trigger")).toHaveText("v1*");
  await expect(autosave).toHaveText(/^Autosaved \d{1,2}:\d{2} [ap]$/);
  expect((await autosave.boundingBox())!.x).toBeLessThan((await selector.boundingBox())!.x);
  await page.reload();
  await expect(selector).toHaveText("Meadow flower");
  await expect(autosave).toHaveAttribute("data-state", "saved");
  await page.screenshot({ path: ".tmp/asset-topbar-desktop.png" });
  await bar.screenshot({ path: ".tmp/asset-topbar.png" });
  await renameAsset(page, "A very long meadow flower archetype name to check the header");
  for (const width of [1024, 950, 850, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const box = (await bar.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    for (const button of await bar.getByRole("button").all()) {
      const control = (await button.boundingBox())!;
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.x + control.width).toBeLessThanOrEqual(width);
    }
  }
  await page.screenshot({ path: ".tmp/asset-topbar-compact.png" });
});

test("autosave failures never claim the draft was saved", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "lamow.vegetation-drafts.v1") throw new DOMException("Storage full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.goto("/assets");
  await renameAsset(page, "Still editable");
  await expect(page.getByTestId("asset-autosave")).toHaveText("Autosave unavailable");
  await expect(page.getByTestId("asset-selector")).toHaveText("Still editable");
  expect(await page.evaluate(() => localStorage.getItem("lamow.vegetation-drafts.v1"))).toBeNull();
});
