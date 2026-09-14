import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine, Scene, Vector3, Quaternion, VertexData } from "@babylonjs/core";
import { compileVegetationPlant } from "../../packages/landscape-renderer/dist/vegetation/recipe.js";
import { defaultVegetationAsset, parseVegetationAsset } from "../../packages/landscape-renderer/dist/vegetation/assets.js";
import { parseObjPrimitiveMesh, objPrimitiveToRenderData } from "../../packages/landscape-renderer/dist/vegetation/objPrimitives.js";
import { createVegetationPatchPlacements } from "../../packages/landscape-renderer/dist/vegetation/coverage.js";
import { createVegetationSpeciesLayer } from "../../packages/landscape-renderer/dist/vegetation/speciesLayer.js";

// Expected positions use elementary vector math, never the renderer's path, rotation,
// deformation, or random functions. The trace is an input measurement, not an oracle.
const rad = d => d * Math.PI / 180;
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, s) => a.map(v => v * s);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v*b[i], 0);
const spin = (p, axis, a) => add(add(scale(p, Math.cos(a)), scale(cross(axis, p), Math.sin(a))), scale(axis, dot(axis, p)*(1-Math.cos(a))));
const yawPitchRoll = (p, yaw, pitch, roll = 0) => spin(spin(spin(p, [0,0,1], rad(roll)), [1,0,0], rad(pitch)), [0,1,0], rad(yaw));
const arcPoint = (l, a, b, t = 1) => {
  const angle = rad(a), azimuth = rad(b);
  // Stable independent form: 1-cos(u) = 2 sin²(u/2).
  const r = angle === 0 ? 0 : 2*l*Math.sin(angle*t/2)**2/angle;
  return [r*Math.cos(azimuth), angle === 0 ? l*t : l*Math.sin(angle*t)/angle, r*Math.sin(azimuth)];
};
const arcVector = (p, a, b, t = 1) => spin(p, [Math.sin(rad(b)), 0, -Math.cos(rad(b))], rad(a)*t);
const V = (ideal, deviation = 0) => ({ ideal, deviation });
const values = max => [-max, -max/2, -0.001, 0, 0.001, max/2, max];
const form = (primitive = "leafBlade", extra = {}) => ({ id: "form", label: "Form", type: "form", primitive, materialId: "petal", width: V(1), length: V(1), ...extra });
const grow = extra => ({ id: "grow", label: "Grow", type: "continue", pathMode: "arc", distance: V(0.4), arcDegrees: V(30), arcAzimuthDegrees: V(20), radiusStart: V(0.02), radiusEnd: V(0.01), formAlongPath: "none", ...extra });
const fork = extra => ({ id: "fork", label: "Fork", type: "fork", layout: "radial", count: V(4), spreadDegrees: V(180), radius: V(0.2), continuation: [form()], ...extra });
const branch = extra => ({ id: "branch", label: "Branch", type: "branch", layout: "alongPath", count: V(3), deviationDegrees: V(45), aroundAxisDegrees: V(20), offshoot: [form()], ...extra });
const dimensions = { stemSkin: [0.7, 0.08], saddlePetal: [0.22, 0.16], leafBlade: [0.35, 0.18], centerDisc: [0.18, 0.18], quadSlat: [2.5, 0.45], seedFuzz: [0.18, 0.08] };
const manifest = JSON.parse(readFileSync(new URL("../../public/vegetation-primitives/manifest.json", import.meta.url), "utf8"));
const sources = manifest.primitives.map(p => parseObjPrimitiveMesh(readFileSync(new URL(`../../public${p.path}`, import.meta.url), "utf8"), p));
// Four labeled points: origin, right, up, forward. A nondegenerate tetrahedron
// distinguishes travel from rotation and detects axis swaps and reflections.
const points = [[0,0,0], [1,0,0], [0,1,0], [0,0,1]];
const probe = id => ({ id, displayName: "Calibration tetrahedron", vertices: points.map(([x,y,z], i) => ({ id: String(i), x,y,z, color: "#ffffff" })), faces: [[0,1,2],[0,2,3],[0,3,1],[1,3,2]].map(vertices => ({ vertices, smoothingGroup: "1" })), sharpEdges: [] });
const probes = Object.keys(dimensions).map(probe);
const definition = (root, primitives = probes) => ({ ...structuredClone(defaultVegetationAsset), primitives, species: { ...structuredClone(defaultVegetationAsset.species), constructionRecipe: { languageVersion: 1, root } } });
const triples = data => Array.from({ length: data.length/3 }, (_, i) => data.slice(i*3, i*3+3));

export function runModifierBench() {
  const groups = new Map();
  let active;
  const group = (name, purpose, fn) => {
    active = { name, purpose, cases: [], failures: [] }; groups.set(name, active);
    try { fn(); } catch (error) { active.failures.push(error.message); }
  };
  const check = (label, fn) => {
    const row = { label, error: 0, expected: [], actual: [] }; active.cases.push(row);
    const near = (actual, expected, tolerance = 2e-6) => {
      row.expected = expected; row.actual = actual;
      assert.equal(actual.length, expected.length, "measurement length");
      const error = Math.max(0, ...actual.map((v, i) => Math.abs(v-expected[i])));
      row.error = Math.max(row.error, error);
      assert.ok(actual.every(Number.isFinite) && error <= tolerance, `error ${error} exceeds ${tolerance}; actual ${actual.slice(0,6)}, expected ${expected.slice(0,6)}`);
    };
    try { fn(near, row); } catch (error) { row.failure = error.message; active.failures.push(`${label}: ${error.message}`); }
  };
  const compile = (root, seed = 0, primitives = probes) => {
    const samples = [];
    const parts = compileVegetationPlant(definition(root, primitives), seed, primitives, { onSample: sample => samples.push(sample) });
    for (const sample of samples) assert.ok(sample.value >= sample.ideal-sample.deviation-1e-10 && sample.value <= sample.ideal+sample.deviation+1e-10, `sample outside range: ${sample.field}`);
    for (const part of parts) {
      const normals = []; VertexData.ComputeNormals(part.positions, part.indices, normals);
      assert.ok(part.positions.every(Number.isFinite) && normals.every(Number.isFinite), "nonfinite geometry/normal");
      assert.ok(part.indices.every(i => Number.isInteger(i) && i >= 0 && i < part.positions.length/3), "invalid topology");
    }
    const sampled = id => Object.fromEntries(samples.filter(s => s.phraseId === id).map(s => [s.field, s.value]));
    return { parts, samples, sampled };
  };
  const sweep = (max, fn) => {
    for (const ideal of values(max)) fn(V(ideal), 0);
    // Maximum deviation at negative, zero and positive ideals, including results
    // beyond the ideal slider's limits. These are valid, deliberately unclamped.
    for (const ideal of [-max, 0, max]) for (let seed = 0; seed < 64; seed++) fn(V(ideal, max), seed);
  };

  for (const mode of ["arc", "legacyDirection"]) for (const [field, max] of [["distance", 0.8], ["arcDegrees", 180], ["arcAzimuthDegrees", 360]]) {
    group(`Grow · ${mode} · ${field}`, "Measure the endpoint and, for continuous arcs, all three transported axes. Maximum deviation may cross zero and extend beyond the ideal input limit.", () => sweep(max, (variation, seed) => check(`${JSON.stringify(variation)}; seed ${seed}`, near => {
      const { parts, sampled } = compile([grow({ pathMode: mode, [field]: variation }), form()], seed);
      const s = sampled("grow"), l = s.distance, a = s.arcDegrees, b = s.arcAzimuthDegrees;
      if (mode === "arc") near(parts[0].positions, points.flatMap(p => add(arcPoint(l,a,b), arcVector(p,a,b))));
      else near(parts[0].positions.slice(0,3), [l*Math.sin(rad(a))*Math.cos(rad(b)), l*Math.cos(rad(a)), l*Math.sin(rad(a))*Math.sin(rad(b))]);
    })));
  }

  for (const field of ["radiusStart", "radiusEnd"]) for (const skin of ["stemSkin", "blade"]) group(`Grow · ${skin} · ${field}`, "Measure signed start/end cross-sections on a curved path, including pinches through zero; verify finite normals.", () => sweep(0.08, (variation, seed) => check(`${JSON.stringify(variation)}; seed ${seed}`, near => {
    const { parts, sampled } = compile([grow({ formAlongPath: skin, [field]: variation })], seed);
    const s = sampled("grow"), vertices = triples(parts[0].positions);
    // Every original source vertex must survive subdivision at its analytical location.
    for (const p of points) {
      const [x,t,z] = p, r = 2*(s.radiusStart*(1-t)+s.radiusEnd*t);
      const expected = add(arcPoint(s.distance,s.arcDegrees,s.arcAzimuthDegrees,t), arcVector([x*r,0,z*r],s.arcDegrees,s.arcAzimuthDegrees,t));
      const nearest = vertices.reduce((best,v) => Math.hypot(...v.map((n,i)=>n-expected[i])) < Math.hypot(...best.map((n,i)=>n-expected[i])) ? v : best);
      near(nearest, expected);
    }
  })));

  const deform = (p, primitive, s) => {
    let [x,y,z] = p;
    if (["leafBlade", "saddlePetal"].includes(primitive)) y += s.cup*x*x + 0.42*s.curl*z*z;
    return [x*s.width, y*s.length, z*(["stemSkin","quadSlat","centerDisc"].includes(primitive) ? s.width : s.length)];
  };
  for (const [primitive, [lengthMax,widthMax]] of Object.entries(dimensions)) for (const [field,max] of [["length",lengthMax],["width",widthMax], ...(["leafBlade","saddlePetal"].includes(primitive) ? [["cup",1],["curl",1]] : [])]) {
    group(`Form · ${primitive} · ${field}`, "Compare every rendered vertex to source coordinates transformed independently. Uses the actual shipped OBJ, including its non-unit dimensions.", () => sweep(max, (variation, seed) => check(`${JSON.stringify(variation)}; seed ${seed}`, near => {
      const f = form(primitive, { width: V(widthMax/2), length: V(lengthMax/2), cup: V(0.2), curl: V(-0.3), [field]: variation });
      const { parts, sampled } = compile([f], seed, sources);
      const source = triples(objPrimitiveToRenderData(sources.find(p => p.id === primitive)).positions);
      near(parts[0].positions, source.flatMap(p => deform(p, primitive, sampled("form"))));
    })));
  }

  for (const layout of ["radial","spiral","mirrored","cluster","sameAxis"]) for (const [field,max] of [["spreadDegrees",360],["radius",0.3],["count",64]]) group(`Fork · ${layout} · ${field}`, "Check copy count, signed offsets and local frames. Cluster is checked for radius and angular bounds, not a particular random sequence.", () => {
    const run = (variation, seed) => check(`${JSON.stringify(variation)}; seed ${seed}`, near => {
      const { parts, sampled } = compile([fork({ layout, [field]: variation })], seed);
      const s = sampled("fork"), n = Math.round(s.count), spread = rad(s.spreadDegrees);
      assert.equal(parts.length, n);
      for (let i = 0; i < n; i++) {
        const theta = layout === "sameAxis" ? 0 : layout === "mirrored" ? (i%2 ? 1 : -1)*spread*(Math.floor(i/2)+1)/(2*Math.ceil(n/2)) : layout === "spiral" ? i*rad(137.50776405003785)*(s.spreadDegrees/360) : layout === "cluster" ? Math.atan2(parts[i].positions[3]-parts[i].positions[0], parts[i].positions[5]-parts[i].positions[2]) : i*spread/(Math.abs(Math.abs(spread)-2*Math.PI)<0.001 ? n : Math.max(1,n-1));
        if (layout === "cluster") {
          // The forward marker reveals theta independent of radius, even at radius zero.
          const origin = parts[i].positions.slice(0,3), forward = parts[i].positions.slice(9,12).map((v,j)=>v-origin[j]);
          const angle = Math.atan2(forward[0],forward[2]);
          near([Math.hypot(...origin)], [Math.abs(s.radius)]);
          const wrapped = spread >= 0 ? (angle+2*Math.PI)%(2*Math.PI) : -((-angle+2*Math.PI)%(2*Math.PI));
          if (Math.abs(spread)<2*Math.PI) assert.ok(Math.abs(wrapped)<=Math.abs(spread)+1e-6, "cluster outside spread");
          near(parts[i].positions, points.flatMap(p=>add(origin,yawPitchRoll(p,angle*180/Math.PI,0))));
        } else near(parts[i].positions, points.flatMap(p => add([Math.sin(theta)*s.radius,0,Math.cos(theta)*s.radius], yawPitchRoll(p,theta*180/Math.PI,0))));
      }
    });
    if (field === "count") { for (const n of [0,1,2,3,32,64]) run(V(n),0); for (let seed=0;seed<64;seed++) run(V(32,32),seed); }
    else sweep(max,run);
  });

  for (const layout of ["alongPath","radial","alternating","tip","fromForm"]) for (const [field,max] of [["deviationDegrees",180],["aroundAxisDegrees",360],["count",64]]) group(`Branch · ${layout} · ${field}`, "Measure attachments on the preceding curved path and the orientation of all three axes; verify copy count.", () => {
    const run = (variation, seed) => check(`${JSON.stringify(variation)}; seed ${seed}`, near => {
      const { parts, samples, sampled } = compile([grow(),branch({ layout,[field]: variation })],seed);
      const g = sampled("grow"), n = Math.round(samples.find(s=>s.phraseId==="branch" && s.field==="count").value);
      assert.equal(parts.length,n);
      const around = samples.filter(s=>s.phraseId==="branch" && s.field==="aroundAxisDegrees"), deviation = samples.filter(s=>s.phraseId==="branch" && s.field==="deviationDegrees");
      for (let i=0;i<n;i++) {
        const t = ["tip","fromForm"].includes(layout) ? 1 : layout==="radial" ? 0.5 : (i+1)/(n+1);
        const theta = around[i].value + (layout==="alternating" ? i*180 : i*360/n);
        near(parts[i].positions,points.flatMap(p=>add(arcPoint(g.distance,g.arcDegrees,g.arcAzimuthDegrees,t),arcVector(yawPitchRoll(p,theta,-deviation[i].value),g.arcDegrees,g.arcAzimuthDegrees,t))));
      }
    });
    if (field==="count") { for (const n of [0,1,2,3,32,64]) run(V(n),0); for (let seed=0;seed<64;seed++) run(V(32,32),seed); }
    else sweep(max,run);
  });

  for (const [field,max] of [["yawDegrees",360],["pitchDegrees",360],["rollDegrees",360],["scale",2]]) group(`Imported Steer · ${field}`, "Verify local yaw/pitch/roll and signed uniform scale on the calibration tetrahedron. Imported recipe feature, no current inspector.", () => sweep(max,(variation,seed)=>check(`${JSON.stringify(variation)}; seed ${seed}`,near=>{
    const {parts,sampled} = compile([{id:"steer",type:"steer",label:"Steer",yawDegrees:V(20),pitchDegrees:V(30),rollDegrees:V(40),scale:V(1),[field]:variation},form()],seed);
    const s=sampled("steer"); near(parts[0].positions,points.flatMap(p=>scale(yawPitchRoll(p,s.yawDegrees,s.pitchDegrees,s.rollDegrees),s.scale)));
  })));

  group("Randomness · actual 16-variant pool", "Measure first-modifier travel for the exact seeds the shared renderer uses. A small pool need not hit both limits, but must not collapse to a sliver of the requested interval.",()=>check("distance 0 ± 0.8; seeds 0–15",(_near,row)=>{
    const output = Array.from({length:16},(_,seed)=>compile([grow({distance:V(0,0.8),arcDegrees:V(0)}),form()],seed).parts[0].positions[1]);
    row.distribution={min:-0.8,max:0.8,values:output};
    const span=Math.max(...output)-Math.min(...output);
    row.result=`Observed span ${(span/1.6*100).toFixed(2)}%; required >65% and both signs`;
    assert.ok(span>1.6*0.65 && output.some(v=>v<0) && output.some(v=>v>0),`16-variant pool covers only ${(span/1.6*100).toFixed(2)}% of the requested interval`);
  }));
  group("Randomness · 4096 consecutive seeds", "Measure generated endpoints independently of trace data: bounds, mean, signs and a 16-bin histogram. Statistical coverage is evidence, not a proof of all random sequences.",()=>check("distance 0 ± 0.8; seeds 0–4095",(_near,row)=>{
    const output=Array.from({length:4096},(_,seed)=>compile([grow({distance:V(0,0.8),arcDegrees:V(0)}),form()],seed).parts[0].positions[1]);
    const bins=Array(16).fill(0); output.forEach(v=>bins[Math.min(15,Math.floor((v+0.8)/1.6*16))]++);
    row.distribution={min:-0.8,max:0.8,values:output,bins};
    assert.ok(output.every(v=>v>=-0.8 && v<=0.8));
    const mean=output.reduce((s,v)=>s+v,0)/output.length;
    row.result=`Mean ${mean.toFixed(6)} m (required within ±0.035 m); bins: ${bins.join(", ")}`;
    assert.ok(Math.abs(mean)<0.035,`biased mean: ${mean}`);
    assert.ok(bins.every(n=>n>180 && n<340),`biased histogram: ${bins}`);
  }));

  group("Defaults, no-ops and compatibility", "Explicitly test absent dimensions, disabled inputs, legacy deformation, material routing, choose weights and construction limits.",()=>{
    check("center length follows the SAME sampled width when absent",near=>{
      const {parts,sampled}=compile([form("centerDisc",{width:V(0.05,0.05),length:undefined})],12);
      const s=sampled("form");near([s.length],[s.width*0.62]);near(parts[0].positions,points.flatMap(p=>deform(p,"centerDisc",s)));
    });
    check("straight arc direction and absent path skin radii do not move markers",near=>{
      const a=compile([grow({arcDegrees:V(0),arcAzimuthDegrees:V(0)}),form()]).parts;
      const b=compile([grow({arcDegrees:V(0),arcAzimuthDegrees:V(360),radiusStart:V(-0.08),radiusEnd:V(0.08)}),form()]).parts;
      near(a[0].positions,b[0].positions);
    });
    check("zero arc distance emits no skin but retains its outgoing frame",near=>{
      const {parts}=compile([grow({distance:V(0),formAlongPath:"stemSkin"}),form()]); assert.equal(parts.length,1);
      near(parts[0].positions,points.flatMap(p=>arcVector(p,30,20)));
    });
    check("legacy Bend is a quadratic skin offset, not an endpoint change",near=>{
      for (const bend of [-2,0,2]) {
        const {parts}=compile([grow({pathMode:"legacyDirection",arcDegrees:V(0),formAlongPath:"stemSkin",bend:V(bend)}),form()]);
        near(parts[0].positions,points.flatMap(([x,y,z])=>[x*(0.04-0.02*y)+bend*y*y*0.04,y*0.4,z*(0.04-0.02*y)]));
        near(parts[1].positions.slice(0,3),[0,0.4,0]);
      }
    });
    check("color changes path material; Form uses its own material",()=>{
      const {parts}=compile([{id:"color",label:"Color",type:"color",materialId:"center"},grow({formAlongPath:"stemSkin"}),form()]);
      assert.deepEqual(parts.map(p=>p.materialId),["center","petal"]);
    });
    check("deprecated side bias cannot reroll a branch with an explicit around-axis value",()=>{
      const b=branch({aroundAxisDegrees:V(0,360)});
      assert.deepEqual(compile([grow(),b],3).parts,compile([grow(),{...b,sideBiasDegrees:V(50,100)}],3).parts);
      assert.deepEqual(compile([grow(),b],3).parts,compile([grow(),{...b,aroundAxisDegrees:undefined,sideBiasDegrees:b.aroundAxisDegrees}],3).parts);
    });
    check("zero-weight choice emits nothing; only positive-weight option is selected",()=>{
      for(const weight of [0,1,100]) {
        const {parts}=compile([{id:"choose",label:"Choose",type:"choose",options:[{weight:0,phrase:[form("stemSkin")]},{weight,phrase:[form()]}]}]);
        assert.equal(parts.length,weight===0?0:1);
      }
    });
    check("safe limits fail explicitly, not as bad geometry",()=>{
      assert.throws(()=>compile([fork({count:V(64),continuation:[fork({id:"inner",count:V(64)})]})]),/2048 forms/);
      let root=[form()]; for(let i=0;i<18;i++) root=[fork({id:`deep-${i}`,count:V(1),continuation:root})];
      assert.throws(()=>compile(root),/16 levels/);
      for (const v of [V(1,-1),V(65),V(0,1)]) assert.throws(()=>parseVegetationAsset(JSON.stringify(definition([fork({count:v})]))));
    });
    check("serialization and optional tracing leave identical output",()=>{
      const asset=definition([grow({distance:V(0,0.8)}),branch()]);
      for (const seed of [0,1,15,4294967295]) assert.deepEqual(compileVegetationPlant(asset,seed),compileVegetationPlant(parseVegetationAsset(JSON.stringify(asset)),seed,asset.primitives,{onSample:()=>{}}));
    });
  });

  group("Patch instances · actual transform buffers", "Read the scene's scale/yaw matrices for 256 adjacent placement seeds. Check broad coverage, independent draws, explicit overrides and the unchanged 16-variant geometry budget.",()=>check("scale 0.5–1.5; yaw −π–π; seeds 0–255",near=>{
    const engine=new NullEngine(),scene=new Scene(engine),asset=definition([form()]);
    asset.species.instanceRanges.scale={min:0.5,max:1.5};asset.species.instanceRanges.yaw={min:-Math.PI,max:Math.PI};
    const layer=createVegetationSpeciesLayer({scene,asset,groundHeightAt:()=>0});
    try {
      layer.setPlants(Array.from({length:256},(_,seed)=>({x:seed,z:0,seed})));
      assert.equal(layer.meshes.length,16,"keep bounded geometry reuse");
      const scales=[],yaws=[];
      for(const mesh of layer.meshes) for(const m of mesh.thinInstanceGetWorldMatrices()) {
        const s=new Vector3(),q=new Quaternion();m.decompose(s,q);scales.push(s.y);yaws.push(q.toEulerAngles().y);
      }
      assert.equal(scales.length,256);
      assert.ok(scales.every(s=>s>=0.5&&s<=1.5)&&yaws.every(y=>y>=-Math.PI&&y<=Math.PI));
      assert.ok(Math.max(...scales)-Math.min(...scales)>0.9);
      assert.ok(Math.max(...yaws)-Math.min(...yaws)>Math.PI*1.8);
      assert.ok(scales.some((s,i)=>Math.abs((s-0.5)-(yaws[i]+Math.PI)/(2*Math.PI))>0.4),"scale and yaw must not share one random value");
      layer.setPlants([{x:0,z:0,seed:7,scale:1.25,yaw:Math.PI/2}]);
      const m=layer.meshes[0].thinInstanceGetWorldMatrices()[0].asArray();near([m[0],m[2],m[5]],[0,-1.25,1.25]);
    } finally {layer.dispose();scene.dispose();engine.dispose();}
  }));

  group("Coverage · count and physical area", "Verify the calibration formula across UI endpoints and stable 50%/100% subsets. This is plant count, not opaque leaf area.",()=>{
    for(const rate of [0.1,25,200]) for(const width of [1,4,8]) for(const density of [0,0.5,1]) check(`${rate} plants/m² × ${width}² m² × ${density}`,near=>{
      const asset=definition([form()]);asset.species.coverage={plantsPerSquareMeter:rate};
      const placements=createVegetationPatchPlacements(asset,{width,density,seed:1});
      near([placements.length],[Math.round(rate*width*width*density)]);
      assert.ok(placements.every(p=>Math.abs(p.x)<=width/2&&Math.abs(p.z)<=width/2));
      assert.deepEqual(placements,createVegetationPatchPlacements(asset,{width,seed:1}).slice(0,placements.length));
    });
  });
  const result=[...groups.values()];
  return { schemaVersion:1, tolerance:2e-6, groups:result, cases:result.reduce((n,g)=>n+g.cases.length,0), failures:result.reduce((n,g)=>n+g.failures.length,0), primitiveExtents:sources.map(p=>({id:p.id,axes:["x","y","z"].map(axis=>{const v=p.vertices.map(v=>v[axis]);return {axis,min:Math.min(...v),max:Math.max(...v),span:Math.max(...v)-Math.min(...v)};})})) };
}
