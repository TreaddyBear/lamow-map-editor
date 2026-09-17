import { test, expect } from "@playwright/test";
import { defaultPack } from "../../frontend/source/utilities/domain/model";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { mapSourceHash } from "../../scripts/game-maps.mjs";

function pack() {
  const value = structuredClone(defaultPack);
  value.pack.name = "Game test pack"; value.defaultLevelCode = "second";
  value.levels = ["first", "second", "level4"].map((code, i) => ({ ...structuredClone(defaultPack.levels[0]), code, fullCode: `game-${code}`, name: `Map ${i + 1}`, spawn: { position: [i * 100, 0], headingDegrees: 90 }, areas: [{ ...structuredClone(defaultPack.levels[0].areas[0]), id: `${code}-lawn`, shape: { type: "rectangle", center: [i * 100, 0], size: [10, 10] } }] }));
  return value;
}
test("game maps load, levels switch without losing edits, and the draft survives visiting assets and reloading", async ({ page }) => {
  const source = pack();
  await page.route("**/api/game-maps", route => route.fulfill({ json: { pack: source, revision: "one", source: "LaMow / lawn-maps.json", baked: { status: "current", codes: source.levels.map(l => l.fullCode) } } }));
  await page.goto("/");
  const select = page.getByRole("combobox", { name: "Current level" });
  await expect(select).toHaveValue("1");
  await expect(select.locator("option")).toHaveCount(3);
  const secondBounds = await page.locator("#map-svg").getAttribute("viewBox");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Edited second");
  await page.getByRole("textbox", { name: "Name", exact: true }).blur();
  await select.selectOption("0");
  await expect(page.locator("#map-svg")).not.toHaveAttribute("viewBox", secondBounds!);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Map 1");
  await select.selectOption("1");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Edited second");
  await page.getByTitle("App menu", { exact: true }).click(); await page.getByRole("menuitem", { name: "Asset editor", exact: true }).click();
  await page.goto("/"); await expect(select).toHaveValue("1");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Edited second");
  await page.getByRole("button", { name: "LaMow maps *", exact: true }).click();
  await page.getByRole("button", { name: "Open LaMow maps", exact: true }).click();
  await expect(page.getByText("Replace this map draft?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Edited second");
  await page.getByRole("button", { name: "LaMow maps *", exact: true }).click();
  const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Export pack", exact: true }).click();
  const download = await downloadEvent, exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(download.suggestedFilename()).toBe("lawn-maps.json"); expect(exported.levels).toHaveLength(3); expect(exported.defaultLevelCode).toBe("second"); expect(exported.levels[1].fullCode).toBe("game-second"); expect(exported.levels[1].name).toBe("Edited second");
  await page.keyboard.press("Escape"); await page.screenshot({ path: ".tmp/map-level-switching.png" });
});

test("new levels have unique codes; undoing one keeps a valid editable level; new source never overwrites a draft", async ({ page }) => {
  const source = pack(); let revision = "one";
  await page.route("**/api/game-maps", route => route.fulfill({ json: { pack: source, revision, source: "LaMow / lawn-maps.json", baked: { status: "stale", codes: [] } } }));
  await page.goto("/"); const select = page.getByRole("combobox", { name: "Current level" }); await expect(select).toHaveValue("1");
  await page.getByTitle("Add level", { exact: true }).click(); await expect(select).toHaveValue("3"); await expect(page.getByRole("textbox", { name: "Code", exact: true })).toHaveValue("level5");
  await page.getByTitle("Undo", { exact: true }).click(); await expect(select).toHaveValue("2");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Still editable"); await page.getByRole("textbox", { name: "Name", exact: true }).blur();
  await expect(select.locator("option:checked")).toContainText("Still editable");
  revision = "two"; source.levels[2].name = "Changed in game";
  await page.getByRole("button", { name: "LaMow maps *", exact: true }).click(); await page.getByRole("button", { name: "Refresh source", exact: true }).click();
  await expect(page.getByTestId("game-map-status")).toContainText("Newer source available"); await expect(page.getByTestId("game-map-status")).toContainText("older");
  await page.getByRole("button", { name: "Open LaMow maps", exact: true }).click(); await page.getByRole("button", { name: "Replace draft", exact: true }).click();
  await select.selectOption("2"); await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Changed in game");
  await page.getByRole("button", { name: "Use this level at game startup", exact: true }).click();
  await expect(page.getByRole("button", { name: "Game startup level", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a late game response cannot replace a map being edited", async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/game-maps", async route => { await gate; await route.fulfill({ json: { pack: pack(), revision: "one", source: "LaMow", baked: { status: "current", codes: [] } } }); });
  await page.goto("/"); await page.getByRole("textbox", { name: "Name", exact: true }).fill("Local work"); await page.getByRole("textbox", { name: "Name", exact: true }).blur(); release();
  await expect(page.getByText("Checking LaMow maps…", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Local work");
});

test("the real local bridge serves all authored levels and rejects writes and baked imports", async ({ page, request }) => {
  const source = pack();
  await mkdir(".tmp/e2e-game/map-exports", { recursive: true });
  await writeFile(".tmp/e2e-game/map-exports/lawn-maps.json", JSON.stringify(source));
  await writeFile(".tmp/e2e-game/map-exports/lawn-maps.baked.json", JSON.stringify({ sourceHash: mapSourceHash(source), maps: source.levels.map(l => ({ code: l.fullCode })) }));
  const response = await request.get("/api/game-maps"); expect(response.ok()).toBe(true);
  const result = await response.json(); expect(result.pack).toEqual(source); expect(result.baked.status).toBe("current");
  expect((await request.post("/api/game-maps", { data: { pack: {} } })).status()).toBe(405);
  await page.goto("/"); await expect(page.getByRole("combobox", { name: "Current level" })).toHaveValue("1");
  await page.getByTitle("Show right sidebar", { exact: true }).click();
  await page.getByLabel("Import", { exact: true }).setInputFiles({ name: "lawn-maps.baked.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ bakedVersion: 2, maps: [] })) });
  await expect(page.getByText("This is a baked game build. Open lawn-maps.json to edit the authored levels.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Current level" })).toHaveValue("1");
  expect(JSON.parse(await readFile(".tmp/e2e-game/map-exports/lawn-maps.json", "utf8"))).toEqual(source);
});
