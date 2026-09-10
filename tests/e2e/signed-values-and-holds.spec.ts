import { test, expect } from "@playwright/test";
import { previewState } from "./preview-state";
import { readFile } from "node:fs/promises";

test("negative travel, radii, fork offsets and form dimensions remain editable and portable", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/assets");
  const set = async (id: string, value: string) => {
    const field = page.getByTestId(`variation-${id}`), input = field.locator("input").first();
    await input.fill("0"); await input.blur();
    await field.getByRole("button", { name: "Decrease Ideal", exact: true }).click();
    expect(Number(await input.inputValue())).toBeLessThan(0);
    await input.fill(value); await input.blur(); await expect(input).toHaveValue(value);
  };
  await page.getByRole("button", { name: "Grow stem", exact: true }).click();
  await set("distance", "-0.2"); await set("start-radius", "-0.01"); await set("end-radius", "0.01");
  await page.getByRole("button", { name: "Fork petals around the head", exact: true }).click();
  await set("radius", "-0.04");
  await page.getByRole("button", { name: "Form saddle petal", exact: true }).click();
  await set("length", "-0.1"); await set("width", "-0.05");
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Export", exact: true }).click();
  const definition = JSON.parse(await readFile((await (await downloadPromise).path())!, "utf8"));
  const [grow, fork] = definition.species.constructionRecipe.root;
  expect(grow.distance.ideal).toBe(-0.2); expect(grow.radiusStart.ideal).toBe(-0.01); expect(grow.radiusEnd.ideal).toBe(0.01);
  expect(fork.radius.ideal).toBe(-0.04); expect(fork.continuation[0].length.ideal).toBe(-0.1); expect(fork.continuation[0].width.ideal).toBe(-0.05);
  await page.reload();
  await page.getByRole("button", { name: "Form saddle petal", exact: true }).click();
  await expect(page.getByTestId("variation-length").locator("input").first()).toHaveValue("-0.1");
  await expect(page.getByTestId("variation-width").locator("input").first()).toHaveValue("-0.05");
  await expect(page.getByRole("alert")).toHaveCount(0); expect(errors).toEqual([]);
});

test("signed shape controls cross zero and persist backward growth", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/assets");
  await page.getByRole("button", { name: "Grow stem", exact: true }).click();
  const arc = page.getByTestId("variation-arc-degrees");
  const ideal = arc.locator("input").first();
  await ideal.fill("0"); await ideal.blur();
  await arc.getByRole("button", { name: "Decrease Ideal", exact: true }).click();
  await expect(ideal).toHaveValue("-1");
  await ideal.fill("-90"); await ideal.blur();
  await page.getByRole("button", { name: "Reset Plant view", exact: true }).click();
  const backward = await previewState(page);
  await ideal.fill("90"); await ideal.blur();
  await expect.poll(async () => (await previewState(page)).meshes.map(mesh => mesh.geometry)).not.toEqual(backward.meshes.map(mesh => mesh.geometry));
  await ideal.fill("-90"); await ideal.blur();
  await page.reload();
  await page.getByRole("button", { name: "Grow stem", exact: true }).click();
  await expect(ideal).toHaveValue("-90");
  await page.getByRole("button", { name: "Form saddle petal", exact: true }).click();
  for (const id of ["cup", "curl"]) {
    const input = page.getByTestId(`variation-${id}`).locator("input").first();
    await input.fill("-0.5"); await input.blur(); await expect(input).toHaveValue("-0.5");
  }
  // A signed ideal is different from a negative +/- magnitude, which stays invalid.
  const variation = page.getByTestId("variation-curl").locator("input").nth(1);
  await variation.fill("-1"); await variation.blur(); await expect(variation).toHaveValue("0");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("holds accelerate gradually over nine seconds, stop on release, and restart gently", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/assets");
  await page.getByRole("button", { name: "Grow stem", exact: true }).click();
  const field = page.getByTestId("variation-arc-degrees"), input = field.locator("input").first();
  await input.fill("-180"); await input.blur();
  const button = field.getByRole("button", { name: "Increase Ideal", exact: true });
  const sample = () => input.evaluate(element => ({ value: Number(element.value), time: performance.now() }));
  await button.hover();
  const samples = [await sample()];
  await page.mouse.down();
  for (const delay of [1000, 2000, 3000, 3000]) {
    await page.waitForTimeout(delay); samples.push(await sample());
  }
  await page.mouse.up();
  const stopped = await input.inputValue(); await page.waitForTimeout(350);
  await expect(input).toHaveValue(stopped);
  const rates = samples.slice(1).map((sample, i) => (sample.value - samples[i].value) * 1000 / (sample.time - samples[i].time));
  console.log("Hold samples (seconds, value)", samples.map(sample => [(sample.time - samples[0].time) / 1000, sample.value]), "average rates", rates);
  expect(rates[0]).toBeGreaterThanOrEqual(1); expect(rates[0]).toBeLessThanOrEqual(5);
  expect(rates[1]).toBeGreaterThan(rates[0]); expect(rates[2]).toBeGreaterThan(rates[1]); expect(rates[3]).toBeGreaterThan(rates[2]);
  expect(rates[3]).toBeLessThanOrEqual(46);
  await button.hover(); await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
  const restartDelta = Number(await input.inputValue()) - Number(stopped);
  expect(restartDelta).toBeGreaterThanOrEqual(1); expect(restartDelta).toBeLessThanOrEqual(5);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(input).toHaveValue(stopped);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(input).toHaveValue("-180");
});

test("holds respect bounds and stop when focus is lost", async ({ page }) => {
  await page.goto("/assets");
  await page.getByRole("button", { name: "Grow stem", exact: true }).click();
  const field = page.getByTestId("variation-arc-degrees"), input = field.locator("input").first();
  await input.fill("179"); await input.blur();
  const button = field.getByRole("button", { name: "Increase Ideal", exact: true });
  await button.hover(); await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
  await expect(input).toHaveValue("180"); await expect(button).toBeDisabled();
  await input.fill("0"); await input.blur();
  await button.hover(); await page.mouse.down(); await page.waitForTimeout(1200);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const stopped = await input.inputValue(); await page.waitForTimeout(500); await page.mouse.up();
  await expect(input).toHaveValue(stopped);
});
