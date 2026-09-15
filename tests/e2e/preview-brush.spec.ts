import { test, expect, type Page } from "@playwright/test";
import { previewState } from "./preview-state";
test.setTimeout(60_000);

async function openPlaytest(page: Page) {
  await page.goto("/assets");
  await page.getByRole("button", { name: "Playtest", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("400 standing");
}
async function point(page: Page, x: number, z: number) {
  return page.evaluate(async ({ x, z }) => {
    const url = performance.getEntriesByType("resource").map(e => e.name).find(n => /\/@babylonjs_core\.js/.test(n))!;
    const { EngineStore, Vector3, Matrix, Viewport } = await import(url);
    const engine = EngineStore.Instances.find((e: any) => e.getRenderingCanvas()?.dataset.testid === "playtest-canvas");
    const scene = engine.scenes[0], camera = scene.cameras[0], rect = engine.getRenderingCanvas().getBoundingClientRect();
    const p = Vector3.Project(new Vector3(x, 0, z), Matrix.Identity(), camera.getTransformationMatrix(), new Viewport(0, 0, rect.width, rect.height));
    return { x: rect.left + p.x, y: rect.top + p.y };
  }, { x, z });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map(e => e.name).find(n => /\/@babylonjs_core\.js/.test(n))!;
    const { EngineStore } = await import(url), engine = EngineStore.Instances.find((e: any) => e.getRenderingCanvas()?.dataset.testid === "playtest-canvas");
    const scene = engine.scenes[0], camera = scene.cameras[0], roots: number[] = [], tilts: number[] = [];
    scene.meshes.filter((m: any) => m.name.startsWith("species-")).forEach((m: any) => m.thinInstanceGetWorldMatrices().forEach((v: any) => { roots.push(v.m[12], v.m[13], v.m[14]); tilts.push(v.m[4], v.m[5], v.m[6]); }));
    return { roots, tilts, frames: scene.getFrameId(), camera: [camera.alpha, camera.beta, camera.radius, ...camera.target.asArray()], meshes: scene.meshes.map((m: any) => m.uniqueId), materials: scene.materials.map((m: any) => m.uniqueId) };
  });
}
async function renderedGrass(page: Page) {
  return page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").map(e => e.name).find(n => /\/@babylonjs_core\.js/.test(n))!;
    const { EngineStore } = await import(url), engine = EngineStore.Instances.find((e: any) => e.getRenderingCanvas()?.dataset.testid === "playtest-canvas");
    const mesh = engine.scenes[0].meshes.find((m: any) => m.name === "reference-grass"), storage = mesh._thinInstanceDataStorage, gl = engine._gl as WebGL2RenderingContext;
    const binding = gl.getParameter(gl.ARRAY_BUFFER_BINDING), gpu = new Float32Array(mesh.thinInstanceCount * 16);
    gl.bindBuffer(gl.ARRAY_BUFFER, storage.matrixBuffer.getBuffer().underlyingResource); gl.getBufferSubData(gl.ARRAY_BUFFER, 0, gpu); gl.bindBuffer(gl.ARRAY_BUFFER, binding);
    const attributes=mesh._userThinInstanceBuffersStorage,colorKey=Object.keys(attributes.data).find(k=>k.toLowerCase().includes("color"))!,colorGpu=new Float32Array(mesh.thinInstanceCount*4);
    gl.bindBuffer(gl.ARRAY_BUFFER,attributes.vertexBuffers[colorKey].getBuffer().underlyingResource);gl.getBufferSubData(gl.ARRAY_BUFFER,0,colorGpu);gl.bindBuffer(gl.ARRAY_BUFFER,binding);
    let visible = 0, height = 0;
    for (let i = 0; i < gpu.length; i += 16) if (gpu[i + 15] && Math.hypot(gpu[i + 12], gpu[i + 14]) < 0.3) { visible++; height += Math.hypot(gpu[i + 4], gpu[i + 5], gpu[i + 6]); }
    return { visible, height, mismatches: gpu.reduce((n, value, i) => n + (value !== storage.matrixData[i] ? 1 : 0), 0)+colorGpu.reduce((n,value,i)=>n+(value!==attributes.data[colorKey][i]?1:0),0) };
  });
}
async function mode(page: Page, label: string) {
  await page.getByRole("toolbar", { name: "Playtest brush" }).getByRole("button", { name: label, exact: true }).click();
  if (label.startsWith("Paint")) await page.getByRole("slider", { name: "Brush softness" }).press("Home");
}
async function reset(page: Page) {
  await page.getByRole("button", { name: "Restore plants", exact: true }).click();
  await page.getByRole("button", { name: "Reset patch", exact: true }).click();
}
async function cutState(page: Page) {
  return page.evaluate(async()=>{
    const url=performance.getEntriesByType("resource").map(e=>e.name).find(n=>/\/@babylonjs_core\.js/.test(n))!;
    const {EngineStore}=await import(url),scene=EngineStore.Instances.find((e:any)=>e.getRenderingCanvas()?.dataset.testid==="playtest-canvas").scenes[0];
    const ground=scene.meshes.find((m:any)=>m.name==="playtest-ground-grass");
    return {texture:ground.material.diffuseTexture.uniqueId,opacity:ground.material.opacityTexture,grass:scene.meshes.filter((m:any)=>m.name.startsWith("playtest-cut-grass")).reduce((n:number,m:any)=>n+m.thinInstanceCount,0),stems:scene.meshes.filter((m:any)=>m.name==="playtest-cut-stems").reduce((n:number,m:any)=>n+m.thinInstanceCount,0),heights:scene.meshes.filter((m:any)=>m.name.startsWith("playtest-cut-")).flatMap((m:any)=>m.thinInstanceGetWorldMatrices().map((v:any)=>v.m[5]))};
  });
}

test("builder comparisons remain inspection-only; Paint is in Playtest and can add beyond the original patch", async ({ page }) => {
  await page.goto("/assets");
  const full = page.getByTestId("preview-full"); await expect(full).toHaveAttribute("data-plant-count", "400");
  await expect(page.getByRole("button", { name: /^(Cut|Paint|Erase)$/ })).toHaveCount(0);
  const before = await previewState(page), box = (await full.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10); await page.mouse.up();
  await expect(full).toHaveAttribute("data-plant-count", "400"); expect((await previewState(page)).meshes).toEqual(before.meshes);
  await page.getByRole("button", { name: "Playtest", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("400 standing");
  await expect(page.getByRole("toolbar", { name: "Playtest brush" }).getByRole("button", { name: "Cut", exact: true })).toHaveAttribute("aria-pressed", "true");
  await mode(page, "Paint flowers"); const outside = await point(page, 2.8, 0); await page.mouse.click(outside.x, outside.y);
  await expect.poll(async () => Number(await page.getByTestId("playtest-canvas").getAttribute("data-plant-count"))).toBeGreaterThan(400);
  await page.screenshot({ path: ".tmp/playtest-painted.png" });
  await mode(page, "Paint grass"); await page.mouse.click(outside.x, outside.y); await expect(page.getByRole("status")).toHaveText("400 standing");
  await page.getByRole("button", { name: "Back to assets" }).click(); await expect(full).toHaveAttribute("data-plant-count", "400");
  await expect(page.getByRole("button", { name: /^(Cut|Paint|Erase)$/ })).toHaveCount(0);
});

test("Playtest hover bends at fixed roots, clicks cut, Paint regrows, and grass changes reach the GPU", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); await openPlaytest(page);
  const canvas = page.getByTestId("playtest-canvas"), center = await point(page, 0, 0), before = await state(page);
  const groundBefore=await cutState(page);
  await page.mouse.move(center.x, center.y); await expect.poll(async () => (await state(page)).tilts).not.toEqual(before.tilts);
  expect((await state(page)).roots).toEqual(before.roots); await expect(page.getByRole("status")).toHaveText("400 standing");
  await page.screenshot({ path: ".tmp/playtest-hover.png" });
  await page.mouse.click(center.x, center.y); await expect.poll(async () => Number(await canvas.getAttribute("data-plant-count"))).toBeLessThan(400);
  const remnant=await cutState(page);expect(remnant.texture).toBe(groundBefore.texture);expect(remnant.opacity).toBeNull();expect(remnant.grass).toBeGreaterThan(0);expect(remnant.stems).toBeGreaterThan(0);
  const count = await canvas.getAttribute("data-plant-count"), q = await point(page, 1.2, 0);
  await page.mouse.move(q.x, q.y); await page.waitForTimeout(100); await expect(canvas).toHaveAttribute("data-plant-count", count!);
  await mode(page, "Paint flowers"); await page.mouse.click(center.x, center.y); await expect(page.getByRole("status")).toHaveText("400 standing");
  await mode(page, "Paint grass"); await page.mouse.click(center.x, center.y);
  await expect.poll(async () => (await renderedGrass(page)).visible).toBeGreaterThan(0);
  const uncut = await renderedGrass(page); expect(uncut.mismatches).toBe(0);
  await mode(page, "Cut"); await page.mouse.click(center.x, center.y);
  await expect.poll(async () => (await renderedGrass(page)).visible).toBe(0);
  expect((await renderedGrass(page)).mismatches).toBe(0);
  await page.screenshot({ path: ".tmp/playtest-cut.png" });
  const after = await state(page); expect(after.meshes).toEqual(before.meshes); expect(after.materials).toEqual(before.materials);
  await reset(page); await expect(page.getByRole("status")).toHaveText("400 standing");
  expect(errors).toEqual([]);
});

test("painting has no force; size and soft-edge controls are visual; an outside brush stays visible but cannot paint",async({page})=>{
  await openPlaytest(page);await mode(page,"Paint flowers");const toolbar=page.getByRole("toolbar",{name:"Playtest brush"}),canvas=page.getByTestId("playtest-canvas");
  await expect(toolbar.getByRole("button",{name:"Erase",exact:true})).toHaveCount(0);await expect(toolbar.getByRole("button",{name:"Orbit",exact:true})).toHaveCount(0);await expect(toolbar.getByRole("button",{name:"Camera",exact:true})).toBeVisible();
  await expect(toolbar.getByText("Brush radius",{exact:true})).toHaveCount(0);
  const before=await state(page),center=await point(page,0,0);await page.mouse.move(center.x,center.y);await page.waitForTimeout(200);expect((await state(page)).tilts).toEqual(before.tilts);
  const outside=await point(page,5,0);await page.mouse.move(outside.x,outside.y);await expect(canvas).toHaveAttribute("data-brush-valid","false");
  const marker=await page.evaluate(async()=>{const url=performance.getEntriesByType("resource").map(e=>e.name).find(n=>/\/@babylonjs_core\.js/.test(n))!;const {EngineStore}=await import(url),scene=EngineStore.Instances.find((e:any)=>e.getRenderingCanvas()?.dataset.testid==="playtest-canvas").scenes[0];return scene.meshes.find((m:any)=>m.name==="brush-outside").isEnabled();});expect(marker).toBe(true);
  const revision=await canvas.getAttribute("data-field-revision");await page.mouse.click(outside.x,outside.y);await expect(canvas).toHaveAttribute("data-field-revision",revision!);await page.screenshot({path:".tmp/playtest-outside-brush.png"});
  await toolbar.getByRole("slider",{name:"Brush size"}).press("End");await toolbar.getByRole("slider",{name:"Brush softness"}).press("End");
  const edge=await point(page,2.6,0);await page.mouse.click(edge.x,edge.y);await expect.poll(async()=>Number(await canvas.getAttribute("data-plant-count"))).toBeGreaterThan(400);const soft=Number(await canvas.getAttribute("data-plant-count"));await page.screenshot({path:".tmp/playtest-soft-paint.png"});
  const softRevision=await canvas.getAttribute("data-field-revision");await page.mouse.click(edge.x,edge.y);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(canvas).toHaveAttribute("data-field-revision",softRevision!);
  await reset(page);await toolbar.getByRole("slider",{name:"Brush softness"}).press("Home");await page.mouse.click(edge.x,edge.y);await expect.poll(async()=>Number(await canvas.getAttribute("data-plant-count"))).toBeGreaterThan(soft);
});

test("saved cut appearance changes the Playtest remnant style and height",async({page})=>{
  await page.goto("/assets");await page.getByText("Cut appearance",{exact:true}).click();await page.getByRole("combobox",{name:"Cut style",exact:true}).selectOption("grass");
  const height=page.locator("label").filter({hasText:"Cut height · meters"}).locator("input");await height.fill("0.12");await height.blur();
  await page.getByRole("button",{name:"Playtest",exact:true}).click();await expect(page.getByRole("status")).toHaveText("400 standing");const center=await point(page,0,0);await page.mouse.click(center.x,center.y);
  await expect.poll(async()=>(await cutState(page)).grass).toBeGreaterThan(0);const cut=await cutState(page);expect(cut.stems).toBe(0);expect(cut.heights.every((h:number)=>Math.abs(h-0.12)<1e-6)).toBe(true);
  await page.screenshot({path:".tmp/playtest-cut-stubble.png"});await page.getByRole("button",{name:"Back to assets"}).click();await page.reload();await page.getByText("Cut appearance",{exact:true}).click();await expect(page.getByRole("combobox",{name:"Cut style",exact:true})).toHaveValue("grass");await expect.poll(async()=>Number(await height.inputValue())).toBe(0.12);
});

test("Playtest strokes connect, cancellation stops mowing, and idle rendering stops after pressure releases", async ({ page }) => {
  test.setTimeout(60_000);
  await openPlaytest(page); const canvas = page.getByTestId("playtest-canvas");
  const from = await point(page, -1, 0), to = await point(page, 1, 0);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 3 }); await page.mouse.up();
  await expect.poll(async () => Number(await canvas.getAttribute("data-plant-count"))).toBeLessThan(380);
  await mode(page, "Camera"); const count = await canvas.getAttribute("data-plant-count"), camera = (await state(page)).camera;
  await page.mouse.move(to.x, to.y); await page.mouse.down(); await page.mouse.move(to.x + 25, to.y + 10); await page.mouse.up();
  expect((await state(page)).camera).not.toEqual(camera); await expect(canvas).toHaveAttribute("data-plant-count", count!);
  await mode(page, "Cut"); const p = await point(page, 0, 1); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(60);
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); const cut = await canvas.getAttribute("data-plant-count"), q = await point(page, -1, -1);
  await page.mouse.move(q.x, q.y); await page.mouse.up(); await expect(canvas).toHaveAttribute("data-plant-count", cut!);
  const costs: number[] = [];
  for (let i = 0; i < 12; i++) { const r = await point(page, -0.8 + i * 0.15, 0); await page.mouse.move(r.x, r.y); await page.waitForTimeout(20); costs.push(Number(await canvas.getAttribute("data-interaction-ms"))); }
  expect(Math.max(...costs)).toBeLessThan(50); console.log("Playtest brush update times (ms)", costs);
  console.log("Playtest scene submission (ms)",await canvas.getAttribute("data-render-ms"));
  await page.mouse.move(5, 5); await expect.poll(async()=>{const frames=(await state(page)).frames;await page.waitForTimeout(250);return (await state(page)).frames===frames;},{timeout:10_000}).toBe(true);
});
