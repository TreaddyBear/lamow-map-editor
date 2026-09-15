import { selectAsset, renameAsset, exportAsset } from "./asset-actions";
import { expect, test, type Page } from "@playwright/test";
import { previewState } from "./preview-state";

async function edit(page: Page, id: string, value: string, variation = false) {
  const field = page.getByTestId(`variation-${id}`).locator("input").nth(variation ? 1 : 0);
  await field.fill(value); await field.blur();
}
async function geometry(page: Page) { return (await previewState(page)).meshes.map((mesh) => mesh.geometry); }

test("every growth and petal control changes geometry without moving the camera or replacing resources", async ({ page }) => {
  await page.goto("/assets");
  await expect(page.getByTestId("vegetation-preview-board")).toHaveAttribute("data-update-ms", /\d/);
  await page.getByRole("button", { name: "Grow stem", exact: true }).click();
  for (const [id, value] of [["distance", "0.25"], ["arc-degrees", "30"], ["arc-direction", "90"], ["start-radius", "0.025"], ["end-radius", "0.004"]]) {
    const before = await previewState(page);
    await edit(page, id, value);
    await expect.poll(() => geometry(page)).not.toEqual(before.meshes.map((mesh) => mesh.geometry));
    const after = await previewState(page);
    expect(after.camera).toEqual(before.camera);
    expect(after.meshIds).toEqual(before.meshIds); expect(after.materialIds).toEqual(before.materialIds);
  }
  await page.getByRole("button", { name: "Fork petals around the head", exact: true }).click();
  for (const [id, value] of [["count", "12"], ["spread-degrees", "180"], ["radius", "0.12"]]) {
    const before = await geometry(page); await edit(page, id, value);
    await expect.poll(() => geometry(page)).not.toEqual(before);
  }
  await page.getByRole("button", { name: "Form saddle petal", exact: true }).click();
  for (const [id, value] of [["length", "0.18"], ["width", "0.12"], ["cup", "0.8"], ["curl", "0.8"]]) {
    const before = await geometry(page); await edit(page, id, value);
    await expect.poll(() => geometry(page)).not.toEqual(before);
    const beforeVariation = await geometry(page); await edit(page, id, "0.001", true);
    await expect.poll(() => geometry(page)).not.toEqual(beforeVariation);
  }
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  const beforeColor = await previewState(page);
  const color = page.locator("label").filter({ hasText: "petal color" }).locator("input").last();
  await color.fill("#ff0033"); await color.blur();
  await expect.poll(async () => (await previewState(page)).meshes.some((mesh) => mesh.material === "#FF0033")).toBe(true);
  const afterColor = await previewState(page);
  expect(afterColor.meshIds).toEqual(beforeColor.meshIds);
  expect(afterColor.materialIds).toEqual(beforeColor.materialIds);
  expect(afterColor.meshes.map((mesh) => mesh.geometry)).toEqual(beforeColor.meshes.map((mesh) => mesh.geometry));
});

test("clover and tulip recipes, branch layouts, and grass controls are connected", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/assets");
  for (const [species, phrase, field, value] of [["clover", "Form leaflet", "length", "0.14"], ["tulip", "Form tulip petal", "cup", "0.9"], ["tulip", "Form long leaf", "curl", "0.8"]]) {
    await selectAsset(page, species);
    await page.getByRole("button", { name: phrase, exact: true }).click();
    const before = await geometry(page); await edit(page, field, value);
    await expect.poll(() => geometry(page)).not.toEqual(before);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Branch leaves from stem", exact: true }).click();
  for (const [id, value] of [["offshoot-count", "5"], ["deviation-angle", "20"], ["around-axis", "120"]]) {
    const before = await geometry(page); await edit(page, id, value);
    await expect.poll(() => geometry(page)).not.toEqual(before);
  }
  const beforeLayout = await geometry(page);
  await page.getByRole("combobox", { name: "Layout", exact: true }).selectOption("radial");
  await expect.poll(() => geometry(page)).not.toEqual(beforeLayout);
  await page.getByText("Slat editor", { exact: true }).click();
  let beforeGrass = (await previewState(page)).grass;
  await page.getByTestId("asset-species-panel-body").getByRole("slider").fill("0.9");
  await expect.poll(async () => (await previewState(page)).grass).not.toEqual(beforeGrass);
  for (const label of ["Vegetation slat color", "Slat second top", "Slat middle", "Slat top", "Slat bottom"]) {
    beforeGrass = (await previewState(page)).grass;
    const color = page.locator("label").filter({ hasText: label }).locator("input").last();
    await color.fill("#ed007f"); await color.blur();
    await expect.poll(async () => (await previewState(page)).grass).not.toEqual(beforeGrass);
  }
  await page.screenshot({ path: ".tmp/grass-controls-audit.png" });
});

test("typing and keyboard buttons work; warm edits stay within the frame budget and idle rendering stops", async ({ page }) => {
  await page.goto("/assets");
  await page.getByRole("button", { name: "Form saddle petal", exact: true }).click();
  const field = page.getByTestId("variation-length");
  const input = field.locator("input").first();
  await input.fill(""); await input.pressSequentially("0.125");
  await expect(input).toHaveValue("0.125"); await input.blur();
  await expect(input).toHaveValue("0.125");
  const increase = field.getByRole("button", { name: "Increase Ideal" });
  await increase.focus(); await page.keyboard.press("Enter"); await expect(input).toHaveValue("0.13");
  await page.keyboard.press("Space"); await expect(input).toHaveValue("0.135");
  const elapsed: number[] = [];
  for (let i = 0; i < 8; i++) {
    const before = await geometry(page); await increase.click();
    await expect.poll(() => geometry(page)).not.toEqual(before);
    elapsed.push(Number(await page.getByTestId("vegetation-preview-board").getAttribute("data-update-ms")));
  }
  // Measures the real main-thread update, not test-runner click latency. Generous headroom for CI.
  expect(Math.max(...elapsed)).toBeLessThan(50);
  await page.waitForTimeout(500);
  const idle = await previewState(page);
  await page.waitForTimeout(300);
  expect((await previewState(page)).frames).toBe(idle.frames);
  console.log("Five-view update times (ms):", elapsed);
  await page.screenshot({ path: ".tmp/vegetation-responsive-editor.png" });
  const coverage = page.locator("label").filter({ hasText: "100% coverage · plants/m²" }).locator("input");
  await coverage.fill("63"); await coverage.blur();
  await expect.poll(async () => (await previewState(page)).meshes.reduce((sum, mesh) => sum + mesh.instances, 0)).toBeGreaterThanOrEqual(1000);
  const patchTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const before = await previewState(page); await increase.click();
    await expect.poll(() => geometry(page)).not.toEqual(before.meshes.map((mesh) => mesh.geometry));
    const after = await previewState(page);
    expect(after.meshIds).toEqual(before.meshIds); expect(after.materialIds).toEqual(before.materialIds); expect(after.camera).toEqual(before.camera);
    patchTimes.push(Number(await page.getByTestId("vegetation-preview-board").getAttribute("data-update-ms")));
  }
  expect(Math.max(...patchTimes)).toBeLessThan(50);
  console.log("Five-view updates with 1008 full-density plants (ms):", patchTimes);
});
