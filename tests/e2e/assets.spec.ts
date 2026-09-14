import { expect, test } from "@playwright/test";
import { previewState } from "./preview-state";

test.beforeEach(async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  await page.exposeFunction("__assetEditorErrors", () => pageErrors);
});

test("asset editor opens a controllable Babylon preview", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/assets");

  await expect(page.getByTestId("asset-editor")).toBeVisible();
  await expect(page.getByTestId("preview-plant")).toBeVisible();

  const preview = page.getByTestId("vegetation-preview-board");
  await expect(preview).toBeVisible();

  const box = await preview.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(320);
  expect(box?.height ?? 0).toBeGreaterThan(320);

  const panelScroll = await page.getByTestId("asset-species-panel-body").evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflowY: style.overflowY, scrollbarGutter: style.scrollbarGutter };
  });
  expect(panelScroll.overflowY).toBe("scroll");
  expect(panelScroll.scrollbarGutter).toContain("stable");
  expect(panelScroll.scrollbarGutter).toContain("both-edges");

  await page.getByRole("button", { name: "Plant view options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Side", exact: true }).click();
  const angles = (await previewState(page)).camera.slice(0, 2);
  await page.getByRole("button", { name: "Reset Plant view", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  expect((await previewState(page)).camera.slice(0, 2)).toEqual(angles);
  for (const id of ["half", "full", "lod-half", "lod-full"]) await expect(page.getByTestId("preview-" + id)).toBeVisible();

});

test("recipe can be rebuilt from scratch without losing the preview", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/assets");
  await expect(page.getByTestId("asset-editor")).toBeVisible();

  const preview = page.getByTestId("vegetation-preview-board");
  await expect(preview).toBeVisible();

  while (await page.getByRole("button", { name: "Delete phrase" }).count()) {
    await page.getByRole("button", { name: "Delete phrase" }).first().click();
  }

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

test("OBJ primitive editor changes vertices, colors, and seam sharpness", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/assets");
  await expect(page.getByTestId("asset-editor")).toBeVisible();

  await page.getByRole("tab", { name: "Meshes", exact: true }).click();
  const editor = page.getByTestId("obj-primitive-editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId("obj-primitive-viewport")).toBeVisible();
  await expect(editor.getByTestId("obj-primitive-canvas")).toBeVisible();
  const selects = editor.locator("select");
  await expect(selects).toHaveCount(2);
  await selects.first().selectOption("leafBlade");
  await selects.last().selectOption("1");

  const xInput = editor.getByTestId("obj-vertex-x").locator("input").first();
  await xInput.fill("0.245");
  await xInput.blur();
  await expect(xInput).toHaveValue("0.245");

  const colorField = editor.locator("label").filter({ hasText: "Vertex color" });
  const colorInput = colorField.locator("input").last();
  await colorInput.fill("#336699");
  await colorInput.blur();
  await expect(colorInput).toHaveValue("#336699");

  await expect(editor.getByRole("button", { name: "1-2 Sharp" })).toBeVisible();
  await editor.getByRole("button", { name: "1-2 Sharp" }).click();
  await expect(editor.getByRole("button", { name: "1-2 Smooth" })).toBeVisible();
  await expect(page.getByTestId("vegetation-preview-board")).toBeVisible();
});
