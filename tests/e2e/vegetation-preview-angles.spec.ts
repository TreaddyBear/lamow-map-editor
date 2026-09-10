import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

async function closeupScreenshot(page: Page, preview: Locator, path: string) {
  const box = await preview.boundingBox();
  expect(box).not.toBeNull();
  const clip = {
    x: box!.x,
    y: box!.y,
    width: box!.width,
    height: box!.height,
  };
  const buffer = await page.screenshot({ path, clip });
  return createHash("sha256").update(buffer).digest("hex");
}

async function orbitCloseup(page: Page, preview: Locator, dx: number, dy: number) {
  const box = await preview.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + (box!.width * 0.5);
  const y = box!.y + (box!.height * 0.2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(60);
}

test("flower closeup can be inspected from multiple orbit angles", async ({ page }) => {
  test.setTimeout(150_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/assets");
  await expect(page.getByTestId("asset-editor")).toBeVisible();
  const preview = page.getByTestId("preview-plant");
  await expect(preview).toBeVisible();

  const hashes = [
    await closeupScreenshot(page, preview, ".tmp/flower-angle-front.png"),
  ];
  await orbitCloseup(page, preview, 300, 0);
  hashes.push(await closeupScreenshot(page, preview, ".tmp/flower-angle-back.png"));
  await orbitCloseup(page, preview, -260, -120);
  hashes.push(await closeupScreenshot(page, preview, ".tmp/flower-angle-high.png"));

  expect(new Set(hashes).size).toBeGreaterThan(2);
  await expect(page.getByTestId("vegetation-preview-board")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
