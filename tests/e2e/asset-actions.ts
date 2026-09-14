import { expect, type Page } from "@playwright/test";
export async function selectAsset(page: Page, id: string) {
  await page.getByTestId("asset-selector").click();
  await page.getByTestId(`asset-option-${id}`).click();
  await expect(page.getByTestId("asset-selector")).toHaveAttribute("data-species-id", id);
}
export async function renameAsset(page: Page, name: string) {
  await page.getByTestId("asset-selector").click();
  await page.getByLabel("Display name", { exact: true }).fill(name);
  await page.getByLabel("Display name", { exact: true }).blur();
  await page.keyboard.press("Escape");
}
export async function exportAsset(page: Page) {
  await page.getByTestId("asset-selector").click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("asset-selection-dialog")).toHaveCount(0);
}
