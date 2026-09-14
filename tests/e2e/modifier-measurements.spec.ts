import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const V = (ideal: number, deviation = 0) => ({ ideal, deviation });
const points = [[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
const probe = { id:"leafBlade",displayName:"Calibration",vertices:points.map(([x,y,z],i)=>({id:String(i),x,y,z,color:"#ffffff"})),faces:[[0,1,2],[0,2,3],[0,3,1],[1,3,2]].map(vertices=>({vertices,smoothingGroup:"1"})),sharpEdges:[] };
const form = (extra = {}) => ({ id:"measure-form",label:"Measure form",type:"form",primitive:"leafBlade",materialId:"petal",width:V(0.1),length:V(0.1),cup:V(0),curl:V(0),...extra });
const grow = (extra = {}) => ({id:"measure-grow",label:"Measure grow",type:"continue",pathMode:"arc",distance:V(0.2),arcDegrees:V(0),arcAzimuthDegrees:V(0),formAlongPath:"none",...extra});

async function importBench(page: Page, root: unknown[]) {
  const asset=JSON.parse(await readFile("tests/fixtures/authored-clover.lamow-vegetation.json","utf8"));
  asset.species.id="measure-"+randomUUID();asset.species.displayName="Modifier calibration";
  asset.species.materials.petal={baseColor:"#eeeeee"};asset.species.coverage={plantsPerSquareMeter:1};
  asset.species.constructionRecipe={languageVersion:1,root};asset.primitives=[probe];asset.editor.tags=["custom"];
  await page.goto("/assets");
  await page.getByLabel("Import",{exact:true}).setInputFiles({name:"calibration.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(asset))});
  await expect(page.getByTestId("asset-selector")).toHaveAttribute("data-species-id",asset.species.id);
  return asset.species.id;
}
async function edit(page: Page, id: string, value: number, deviation=false) {
  const input=page.getByTestId(`variation-${id}`).locator("input").nth(deviation?1:0);
  await input.fill(String(value));await input.blur();
}
async function geometry(page: Page, _species: string): Promise<number[][]> {
  return page.evaluate(async()=>{
    const url=performance.getEntriesByType("resource").map(e=>e.name).find(n=>/\/@babylonjs_core\.js/.test(n));
    if(!url) return [];
    const {EngineStore}=await import(url);
    const scene=EngineStore.Instances.find((e:any)=>e.getRenderingCanvas()?.dataset.testid==="vegetation-preview-board")?.scenes[0];
    // Meshes are reused across asset selections, so their creation-time species
    // name is not necessarily the currently edited species ID.
    return scene?.meshes.filter((m:any)=>m.name.startsWith("species-")&&m.name.endsWith("-petal")).map((m:any)=>[...m.getVerticesData("position")])??[];
  });
}
async function expectGeometry(page: Page,species: string,expected: number[]) {
  await expect.poll(async()=>{
    const meshes=await geometry(page,species);
    return meshes.length>0&&meshes.every(v=>v.length===expected.length&&v.every((n,i)=>Math.abs(n-expected[i])<2e-6));
  }).toBe(true);
}

test("Form inputs produce measured signed dimensions, leaf cup and curl; deviation reaches both signs",async({page})=>{
  test.setTimeout(90_000);
  const species=await importBench(page,[form()]);
  await page.getByRole("button",{name:"Measure form",exact:true}).click();
  const state={length:0.1,width:0.1,cup:0,curl:0};
  for(const [field,max] of [["length",0.35],["width",0.18],["cup",1],["curl",1]] as const) {
    for(const value of [-max,0,max]) {
      await edit(page,field,value);state[field]=value;
      await expectGeometry(page,species,points.flatMap(([x,y,z])=>[x*state.width,(y+state.cup*x*x+0.42*state.curl*z*z)*state.length,z*state.length]));
    }
    const input=page.getByTestId(`variation-${field}`).locator("input").first();
    await edit(page,field,max*2);await expect(input).toHaveValue(String(max));
  }
  await edit(page,"length",0);await edit(page,"length",0.35,true);
  await expect.poll(async()=>{
    const lengths=(await geometry(page,species)).map(v=>v[11]);
    return lengths.some(n=>n<0)&&lengths.some(n=>n>0)&&lengths.every(n=>Math.abs(n)<=0.35);
  }).toBe(true);
});

test("Grow inputs move the measured endpoint, including negative random travel",async({page})=>{
  test.setTimeout(90_000);
  const species=await importBench(page,[grow(),form({length:V(0),width:V(0)})]);
  await page.getByRole("button",{name:"Measure grow",exact:true}).click();
  await expect(page.getByTestId("variation-arc-direction").locator("input").first()).toBeDisabled();
  const s={distance:0.2,arc:0,direction:0};
  for(const [id,key,values] of [["distance","distance",[-0.8,0,0.8]],["arc-degrees","arc",[-180,-90,0,90,180]],["arc-direction","direction",[-360,-90,0,90,360]]] as const) for(const value of values) {
    await edit(page,id,value);s[key]=value;
    const a=s.arc*Math.PI/180,b=s.direction*Math.PI/180,r=a===0?0:2*s.distance*Math.sin(a/2)**2/a;
    const p=[r*Math.cos(b),a===0?s.distance:s.distance*Math.sin(a)/a,r*Math.sin(b)];
    await expectGeometry(page,species,points.flatMap(()=>p));
  }
  await edit(page,"arc-degrees",0);await edit(page,"distance",0);await edit(page,"distance",0.8,true);
  await expect.poll(async()=>{
    const y=(await geometry(page,species)).map(v=>v[1]);return y.some(v=>v<0)&&y.some(v=>v>0)&&y.every(v=>Math.abs(v)<=0.8);
  }).toBe(true);
});

test("Fork and Branch controls produce measured counts, offsets and orientations",async({page})=>{
  test.setTimeout(90_000);
  const marker=form({width:V(0),length:V(0)});
  const species=await importBench(page,[{id:"measure-fork",label:"Measure fork",type:"fork",count:V(4),layout:"radial",spreadDegrees:V(360),radius:V(0.1),continuation:[marker]}]);
  await page.getByRole("button",{name:"Measure fork",exact:true}).click();
  for(const count of [1,4,64]) {
    await edit(page,"count",count);
    for(const radius of [-0.3,0,0.3]) {
      await edit(page,"radius",radius);
      await expectGeometry(page,species,Array.from({length:count},(_,i)=>points.flatMap(()=>[Math.sin(i*2*Math.PI/count)*radius,0,Math.cos(i*2*Math.PI/count)*radius])).flat());
    }
  }
  await edit(page,"count",4);
  for(const spread of [-360,-180,0,180,360]) {
    await edit(page,"spread-degrees",spread);
    await expectGeometry(page,species,Array.from({length:4},(_,i)=>{const a=i*spread*Math.PI/180/(Math.abs(spread)===360?4:3);return points.flatMap(()=>[Math.sin(a)*0.3,0,Math.cos(a)*0.3]);}).flat());
  }
  const other=await importBench(page,[grow(),{id:"measure-branch",label:"Measure branch",type:"branch",count:V(1),layout:"tip",deviationDegrees:V(0),aroundAxisDegrees:V(0),offshoot:[form()]}]);
  await page.getByRole("button",{name:"Measure branch",exact:true}).click();
  for(const deviation of [-180,-90,0,90,180]) for(const around of [-360,0,90,360]) {
    await edit(page,"deviation-angle",deviation);await edit(page,"around-axis",around);
    const p=-deviation*Math.PI/180,a=around*Math.PI/180;
    await expectGeometry(page,other,points.flatMap(([x,y,z])=>{
      const py=y*Math.cos(p)-z*Math.sin(p),pz=y*Math.sin(p)+z*Math.cos(p);
      return [0.1*(x*Math.cos(a)+pz*Math.sin(a)),0.2+0.1*py,0.1*(pz*Math.cos(a)-x*Math.sin(a))];
    }));
  }
});

test("Any direction is a full circle and population rotation reaches real instance matrices",async({page})=>{
  test.setTimeout(60_000);
  const species=await importBench(page,[grow({arcDegrees:V(60),arcAzimuthDegrees:V(350,270)}),form()]);
  await page.getByRole("button",{name:"Measure grow",exact:true}).click();
  const direction=page.getByTestId("variation-arc-direction");
  await expect(direction.locator("input").nth(1)).toHaveValue("180");
  const any=page.getByRole("button",{name:"Arc direction: any direction",exact:true});
  await expect(any).toHaveAttribute("aria-pressed","true");
  await any.click();await expect(direction.locator("input").nth(1)).toHaveValue("0");
  await any.click();await expect(direction.locator("input").nth(1)).toHaveValue("180");
  // Whole turns of Ideal must leave every seeded shape unchanged.
  await edit(page,"arc-direction",0);const before=await geometry(page,species);
  await edit(page,"arc-direction",360);
  await expect.poll(async()=>{const after=await geometry(page,species);return after.length===before.length&&after.every((p,i)=>p.every((v,j)=>Math.abs(v-before[i][j])<2e-6));}).toBe(true);
  await page.getByText("Population",{exact:true}).click();
  const population=page.getByTestId("variation-plant-rotation");
  await expect(population.locator("input").nth(1)).toHaveValue("180");
  await page.getByRole("button",{name:"Plant rotation: any direction",exact:true}).click();
  await edit(page,"plant-rotation",90);
  const matrices=()=>page.evaluate(async()=>{
    const url=performance.getEntriesByType("resource").map(e=>e.name).find(n=>/\/@babylonjs_core\.js/.test(n))!;
    const {EngineStore}=await import(url);const scene=EngineStore.Instances.find((e:any)=>e.getRenderingCanvas()?.dataset.testid==="vegetation-preview-board").scenes[0];
    return scene.meshes.filter((m:any)=>m.name.startsWith("species-")&&m.layerMask===4).flatMap((m:any)=>m.thinInstanceGetWorldMatrices().map((matrix:any)=>{const a=matrix.asArray();return [a[0],a[2],a[5]];}));
  });
  await expect.poll(async()=>{const all=await matrices();return all.length>0&&all.every(([x,z,s])=>Math.abs(x)<2e-6&&Math.abs(z+s)<2e-6);}).toBe(true);
  await page.getByRole("button",{name:"Plant rotation: any direction",exact:true}).click();
  await expect.poll(async()=>{const all=await matrices();return all.some(([x])=>x<0)&&all.some(([x])=>x>0);}).toBe(true);
  await page.screenshot({path:".tmp/angular-audit/editor-controls.png",fullPage:true});
});
