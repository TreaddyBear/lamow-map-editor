import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { selectAsset, exportAsset } from "./asset-actions";
const coverage = (page: Page) => page.locator("label").filter({ hasText: "100% coverage · plants/m²" }).locator("input");
const badge = (page: Page) => page.getByTestId("asset-version-trigger");
const close = (page: Page) => page.getByRole("button", { name: "Close versions", exact: true }).click();
async function edit(page: Page, value: string) { await coverage(page).fill(value); await coverage(page).blur(); }
async function importCustom(page: Page) {
  const asset = JSON.parse(await readFile("tests/fixtures/authored-clover.lamow-vegetation.json", "utf8"));
  asset.species.id = "versionTest-" + randomUUID(); asset.species.displayName = "Version Test";
  asset.species.coverage.plantsPerSquareMeter = 30; asset.editor.tags = ["custom"];
  await page.goto("/assets");
  await page.getByLabel("Import", { exact: true }).setInputFiles({ name: "archetype.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(asset)) });
  await expect(page.getByTestId("asset-selector")).toHaveAttribute("data-species-id", asset.species.id);
  await expect(badge(page)).toHaveText("v1"); return asset;
}
test("immutable versions distinguish dirty drafts; clean switches need no confirmation, dirty switches reset only their own history", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const asset = await importCustom(page);
  await expect(page.getByTestId("asset-autosave")).toHaveCount(0);
  await edit(page, "45"); await expect(badge(page)).toHaveText("v1*");
  await badge(page).click(); await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(badge(page)).toHaveText("v2");
  await page.getByRole("button", { name: "Select v1 · Imported", exact: true }).click();
  await page.getByRole("button", { name: "Make v1 current", exact: true }).click();
  await expect(coverage(page)).toHaveValue("30");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await badge(page).click(); await page.getByRole("button", { name: "Select v2 · Version 2", exact: true }).click();
  await page.getByRole("button", { name: "Make v2 current", exact: true }).click();
  await edit(page, "55"); await expect(badge(page)).toHaveText("v2*");
  await badge(page).click(); await page.getByRole("button", { name: "Select v1 · Imported", exact: true }).click();
  await page.getByRole("button", { name: "Make v1 current", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Discard draft changes?", exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.locator("p")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(coverage(page)).toHaveValue("55");
  await page.getByRole("button", { name: "Make v1 current", exact: true }).click();
  await page.getByRole("button", { name: "Discard & switch", exact: true }).click();
  await expect(coverage(page)).toHaveValue("30"); await expect(badge(page)).toHaveText("v1");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.reload(); await expect(coverage(page)).toHaveValue("30"); await expect(badge(page)).toHaveText("v1");
  await badge(page).click(); await page.getByRole("button", { name: "Make v2 current", exact: true }).click();
  await edit(page, "55"); await expect(badge(page)).toHaveText("v2*");
  await badge(page).click();
  await page.getByRole("button", { name: "Make v2 default", exact: true }).click();
  const card = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Select v2 · Version 2", exact: true }) });
  await expect(card.getByTestId("version-default")).toBeVisible();
  await expect(card.getByTestId("version-current")).toBeVisible();
  await page.screenshot({ path: ".tmp/archetype-versions.png" }); await close(page);
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage(); await other.goto("http://127.0.0.1:5192/assets"); await selectAsset(other, asset.species.id);
    await expect(coverage(other)).toHaveValue("45"); await expect(badge(other)).toHaveText("v2");
  } finally { await fresh.close(); }
  const index = await (await page.request.get("/api/vegetation-library")).json();
  const entry = index.archetypes.find((entry: { speciesId: string }) => entry.speciesId === asset.species.id);
  expect(entry.versions).toHaveLength(2);
  const saved = await (await page.request.get("/api/vegetation-library/versions/" + entry.versions[0].id)).json();
  expect(saved.asset.primitives).toEqual(asset.primitives); expect(saved.asset.species.coverage.plantsPerSquareMeter).toBe(30);
  expect(errors).toEqual([]);
});

test("asset menu duplicates and exports all versions plus the active draft", async ({ page }) => {
  const asset = await importCustom(page);
  await edit(page, "40"); await badge(page).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(badge(page)).toHaveText("v2"); await close(page);
  await edit(page, "50"); await page.getByTestId("asset-selector").click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByTestId("asset-selector")).toHaveAttribute("data-species-id", asset.species.id + "Copy");
  await expect(coverage(page)).toHaveValue("50"); await expect(badge(page)).toHaveText("v2*");
  const downloadPromise = page.waitForEvent("download"); await exportAsset(page);
  const exported = JSON.parse(await readFile((await (await downloadPromise).path())!, "utf8"));
  expect(exported.species.coverage.plantsPerSquareMeter).toBe(50);
  expect(exported.archetypeLibrary.versions.map((v: any) => v.asset.species.coverage.plantsPerSquareMeter)).toEqual([30,40]);
  await page.getByLabel("Import", { exact: true }).setInputFiles({ name: "whole.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.getByRole("dialog", { name: "Replace draft?", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).click();
  await expect(badge(page)).toHaveText("v4*"); await expect(coverage(page)).toHaveValue("50");
});

test("failed saves preserve drafts and stale windows refresh before retrying", async ({ page }) => {
  const asset = await importCustom(page); await edit(page, "35");
  await badge(page).click(); await page.getByRole("button", { name: "Create new version", exact: true }).click();
  await page.getByLabel("Version name", { exact: true }).fill("Keep this work");
  await page.route("**/api/vegetation-library/versions", route => route.abort("failed"));
  await page.getByRole("button", { name: "Create version", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your draft is still here"); await expect(badge(page)).toHaveText("v1*");
  await page.unroute("**/api/vegetation-library/versions");
  const index = await (await page.request.get("/api/vegetation-library")).json();
  expect((await page.request.post("/api/vegetation-library/versions", { headers: { Origin: "http://127.0.0.1:5192" }, data: { asset, label: "Other window", expectedRevision: index.revision } })).status()).toBe(201);
  await page.getByRole("button", { name: "Create version", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("another window");
  await page.getByRole("button", { name: "Create version", exact: true }).click(); await expect(badge(page)).toHaveText("v3");
  await close(page); await expect(coverage(page)).toHaveValue("35");
});
