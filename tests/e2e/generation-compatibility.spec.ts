import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {parseVegetationAsset} from "../../packages/landscape-renderer/dist/vegetation/assets.js";

test("unmarked saved versions recover the matching clean version without rewriting history",async({page})=>{
  const current=parseVegetationAsset(await readFile("tests/fixtures/authored-clover.lamow-vegetation.json","utf8"));
  delete current.generationVersion;
  current.species.id="legacy-version";current.editor!.tags=["custom"];
  const first=structuredClone(current);first.species.coverage!.plantsPerSquareMeter=10;
  current.species.coverage!.plantsPerSquareMeter=25;
  const records=[first,current].map((asset,i)=>({id:randomUUID(),number:i+1,label:`Version ${i+1}`,createdAt:"2026-09-12T12:00:00Z",assetHash:createHash("sha256").update(JSON.stringify(asset)).digest("hex"),parentVersionId:null,kind:"saved",schemaVersion:1,asset}));
  const index={schemaVersion:1,revision:2,archetypes:[{speciesId:current.species.id,displayName:current.species.displayName,standardVersionId:records[0].id,versions:records.map(({asset,schemaVersion,...metadata})=>metadata)}]};
  const writes:string[]=[];
  await page.route("**/api/vegetation-library**",async route=>{
    if(route.request().method()!=="GET"){writes.push(route.request().url());return route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({error:"Unexpected write"})});}
    const id=route.request().url().split("/versions/")[1];
    await route.fulfill({contentType:"application/json",body:JSON.stringify(id?records.find(r=>r.id===id):index)});
  });
  await page.addInitScript(asset=>localStorage.setItem("lamow.vegetation-drafts.v1",JSON.stringify({speciesAssets:[asset],primitiveMeshes:asset.primitives,selectedSpeciesId:asset.species.id,versionBases:{},savedAt:Date.now()})),current);
  await page.goto("/assets");
  await expect(page.getByTestId("asset-version-trigger")).toHaveText("v2");
  await expect(page.getByTestId("asset-autosave")).toHaveCount(0);
  expect(writes).toEqual([]);
});
