import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.exposeFunction("__assetEditorErrors", () => pageErrors);
});

test("asset editor opens a controllable Babylon preview", async ({ page }) => {
  await page.goto("/assets");

  await expect(page.getByTestId("asset-editor")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Babylon Previews" })).toBeVisible();

  const preview = page.getByTestId("vegetation-preview-board");
  await expect(preview).toBeVisible();

  const box = await preview.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(320);
  expect(box?.height ?? 0).toBeGreaterThan(320);

  await page.getByRole("button", { name: "Flower Closeup options" }).click();
  await expect(page.getByText("Closeup View")).toBeVisible();
  await page.getByRole("menuitem", { name: "Side profile view" }).click();
  await expect(page.getByRole("button", { name: "Flower Closeup options" })).toBeVisible();
});

test("recipe can be rebuilt from scratch without losing the preview", async ({ page }) => {
  await page.goto("/assets");
  await expect(page.getByTestId("asset-editor")).toBeVisible();

  const preview = page.getByTestId("vegetation-preview-board");
  await expect(preview).toBeVisible();

  while (await page.getByRole("button", { name: "Delete phrase" }).count()) {
    await page.getByRole("button", { name: "Delete phrase" }).first().click();
  }

  await expect(page.getByText("This recipe is empty. Add a root phrase to build from scratch.")).toBeVisible();
  await expect(preview).toBeVisible();

  await page.getByRole("button", { name: "Grow" }).first().click();
  await expect(page.getByRole("button", { name: "Add Grow" })).toBeVisible();
  await page.getByRole("button", { name: "Add Grow" }).click();
  await expect(page.getByRole("button", { name: "Grow forward" })).toBeVisible();
  await expect(preview).toBeVisible();

  await page.getByRole("button", { name: "Branch" }).first().click();
  await expect(page.getByText("Deviation angle", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Branch" }).click();
  await expect(page.getByRole("button", { name: "Branch offshoot" })).toBeVisible();
  await expect(preview).toBeVisible();

  await page.getByRole("button", { name: "Branch offshoot" }).click();
  await expect(page.getByText("Around axis", { exact: true })).toBeVisible();

  const increaseIdeal = page.getByRole("button", { name: "Increase Ideal" }).first();
  await increaseIdeal.hover();
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(preview).toBeVisible();

  const pageErrors = await page.evaluate(async () => (globalThis as unknown as { __assetEditorErrors: () => string[] }).__assetEditorErrors());
  expect(pageErrors).toEqual([]);
});
