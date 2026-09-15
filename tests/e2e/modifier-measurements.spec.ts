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
  asset.species.constructionRecipe={languageVersion:1,root};asset.primitives=["leafBlade","saddlePetal","stemSkin","quadSlat","centerDisc"].map(id=>({...probe,id}));asset.editor.tags=["custom"];
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
    await expectGeometry(page,species,Array.from({length:4},(_,i)=>{const a=i*spread*Math.PI/180/4;return points.flatMap(()=>[Math.sin(a)*0.3,0,Math.cos(a)*0.3]);}).flat());
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

test("Grow direction covers a full circle through the existing growth controls",async({page})=>{
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
  await page.screenshot({path:".tmp/angular-audit/editor-controls.png",fullPage:true});
});

test("numeric cancellation, typed nudges and invalid colors preserve the intended edit",async({page})=>{
  const species=await importBench(page,[form()]);
  await page.getByRole("button",{name:"Measure form",exact:true}).click();
  const input=page.getByTestId("variation-length").locator("input").first();
  const initial=await geometry(page,species);
  for(const blank of ["","   "]){await input.fill(blank);await input.blur();await expect(input).toHaveValue("0.1");expect(await geometry(page,species)).toEqual(initial);}
  await input.fill("0.2");await input.press("Escape");await expect(input).toHaveValue("0.1");expect(await geometry(page,species)).toEqual(initial);
  await input.fill("0.2");await input.press("ArrowUp");await expect(input).toHaveValue("0.205");await input.blur();
  await expectGeometry(page,species,points.flatMap(([x,y,z])=>[x*0.1,y*0.205,z*0.205]));
  await page.getByRole("tab",{name:"Colors",exact:true}).click();
  const color=page.locator("label").filter({hasText:"petal color"}).locator("input").last();
  const saved=await color.inputValue();await color.fill("not a color");await color.blur();await expect(color).toHaveValue(saved);
});

test("editing or adding an independent component does not reroll existing geometry",async({page})=>{
  const species=await importBench(page,[form({length:V(0.1,0.03),width:V(0.1,0.02),cup:undefined,curl:undefined}),form({id:"later",label:"Later",length:V(0.1,0.03),width:V(0.1,0.02)})]);
  await page.getByRole("button",{name:"Measure form",exact:true}).click();
  await expect.poll(async()=>{const p=await geometry(page,species);return p.length>0&&p.every(v=>v.length===24);}).toBe(true);
  const initial=await geometry(page,species);
  await edit(page,"cup",1);
  // Babylon retains Float32 data on allocation and JS doubles after an in-place update.
  await expect.poll(async()=>{const next=await geometry(page,species);return next.length===initial.length&&next.every((p,i)=>p.slice(12).every((v,j)=>Math.abs(v-initial[i][j+12])<2e-6));}).toBe(true);
  await edit(page,"cup",0);await expect.poll(async()=>{const next=await geometry(page,species);return next.length===initial.length&&next.every((p,i)=>p.length===initial[i].length&&p.every((v,j)=>Math.abs(v-initial[i][j])<2e-6));}).toBe(true);
  await page.getByRole("button",{name:"Form",exact:true}).click();
  await page.getByRole("button",{name:"Add Form",exact:true}).click();
  await expect.poll(async()=>{const next=await geometry(page,species);return next.length===initial.length&&next.every((p,i)=>p.length>initial[i].length&&p.slice(0,initial[i].length).every((v,j)=>Math.abs(v-initial[i][j])<2e-6));}).toBe(true);
});

test("actual LOD mask shader covers the requested area and grows monotonically",async({page})=>{
  await page.goto("/assets");
  await expect(page.getByTestId("vegetation-preview-board")).toHaveAttribute("data-update-ms",/\d/);
  const result=await page.evaluate(async radiusModule=>{
    const url=performance.getEntriesByType("resource").map(e=>e.name).find(n=>/\/@babylonjs_core\.js/.test(n))!;
    const {Effect}=await import(url),{coverageDotRadius}=await import(radiusModule);
    const source=Effect.ShadersStore.vegetationSlatsFragmentShader;
    const mask=source.slice(source.indexOf("vec2 cell ="),source.indexOf("vec3 topMix ="));
    if(!mask.includes("dotRadius"))throw new Error("Production mask not found");
    const canvas=document.createElement("canvas");canvas.width=canvas.height=256;
    const gl=canvas.getContext("webgl",{antialias:false,preserveDrawingBuffer:true})!;
    if(!gl)throw new Error("WebGL is required to measure the mask");
    const shader=(type:number,text:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)!);return s;};
    const build=(body:string)=>{
      const vertex=shader(gl.VERTEX_SHADER,"attribute vec2 p; varying vec2 uv; void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0.0,1.0);}");
      const fragment=shader(gl.FRAGMENT_SHADER,"precision highp float;varying vec2 uv;uniform float patternMode, patternScale, vegetationCoverage, dotRadius;const float PI=3.14159265359;void main(){vec3 vWorldPos=patternMode<0.5?vec3(uv.x*1.41421356237,0.0,0.0):vec3(uv.x,0.0,uv.y);"+body+"gl_FragColor=vec4(vec3(vegetation),1.0);}");
      const p=gl.createProgram()!;gl.attachShader(p,vertex);gl.attachShader(p,fragment);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)!);return p;
    };
    // Compile the production mask itself; remove lighting only to read binary area.
    const current=build(mask),legacy=build(mask.replace("dotRadius);","sqrt(vegetationCoverage / PI));"));
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.viewport(0,0,256,256);
    const measure=(program:WebGLProgram,mode:number,coverage:number)=>{
      gl.useProgram(program);const location=gl.getAttribLocation(program,"p");gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      for(const [name,value] of Object.entries({patternMode:mode,patternScale:1,vegetationCoverage:coverage,dotRadius:coverageDotRadius(coverage)}))gl.uniform1f(gl.getUniformLocation(program,name),value);
      gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return Uint8Array.from({length:256*256},(_,i)=>pixels[i*4]>128?1:0);
    };
    const rows=[];for(const mode of [0,1]){let previous=new Uint8Array(256*256);for(const coverage of [0,0.1,0.25,0.5,0.75,0.8,0.9,0.95,0.99,1]){const pixels=measure(current,mode,coverage);rows.push({mode,coverage,actual:pixels.reduce((a,b)=>a+b,0)/pixels.length,monotonic:pixels.every((v,i)=>v>=previous[i])});previous=pixels;}}
    const old=measure(legacy,1,0.99);gl.getExtension("WEBGL_lose_context")?.loseContext();
    return {rows,old99:old.reduce((a,b)=>a+b,0)/old.length};
  },"/@fs/"+process.cwd().replaceAll("\\","/")+"/packages/landscape-renderer/dist/vegetation/coveragePattern.js");
  for(const row of result.rows){expect(Math.abs(row.actual-row.coverage)).toBeLessThan(0.004);expect(row.monotonic).toBe(true);}
  expect(result.old99).toBeLessThan(0.94);
  console.log("LOD coverage measurements",result);
});
