import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine, Scene, VertexBuffer, VertexData } from "@babylonjs/core";
import { compileVegetationPlant, createVegetationSpeciesLayer, parseVegetationAsset } from "../packages/landscape-renderer/dist/index.js";
import { defaultVegetationAsset } from "../packages/landscape-renderer/dist/vegetation/assets.js";
import { defaultObjPrimitiveLibrary } from "../packages/landscape-renderer/dist/vegetation/objPrimitives.js";
import { growthArcPose, subdivideGrowthSource } from "../packages/landscape-renderer/dist/vegetation/growthPath.js";
import { createVegetationPatchPlacements } from "../packages/landscape-renderer/dist/vegetation/coverage.js";
import { Vector3 } from "@babylonjs/core";
import { stemGrowthVector } from "../packages/landscape-renderer/dist/vegetation/geometry.js";
import { createReferenceGrass } from "../packages/landscape-renderer/dist/vegetation/referenceGrass.js";
import { gameBladeGeometry, gameBladesPerSquareMeter, gameGrassSettings } from "../packages/landscape-renderer/dist/vegetation/gameReference/settings.js";
import { generationContractCases, generationFingerprint } from "./helpers/generation-contract.mjs";

test("generation version 1 preserves established output fingerprints across 48 saved cases",()=>{
  const expected=JSON.parse(readFileSync(new URL("./fixtures/generation-v1.json",import.meta.url),"utf8"));
  for(const [name,definition] of Object.entries(generationContractCases()))for(let seed=0;seed<16;seed++){
    assert.deepEqual(generationFingerprint(definition,seed),expected[name][seed],`${name}, seed ${seed}: generation-v1 output changed; preserve compatibility rather than blindly refreshing this fixture`);
  }
  const unsupported={...generationContractCases().flower,generationVersion:2};
  assert.throws(()=>parseVegetationAsset(JSON.stringify(unsupported)),/generation version/);
  assert.throws(()=>compileVegetationPlant(unsupported),/generation version/);
});

test("game reference uses real blade geometry, calibrated area and repeatable instances without allocating during recipe edits", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const layer = createReferenceGrass(scene); layer.update(4, 0.5, 3);
  assert.deepEqual([...layer.mesh.getVerticesData("position")], gameBladeGeometry.positions);
  assert.equal(layer.mesh.thinInstanceCount, Math.round(16 * gameBladesPerSquareMeter * 0.5));
  const matrices = layer.mesh.thinInstanceGetWorldMatrices().map(matrix => [...matrix.asArray()]);
  assert.ok(matrices.every(matrix => matrix.every(Number.isFinite) && matrix[5] >= gameGrassSettings.minHeight && matrix[5] <= gameGrassSettings.maxHeight));
  const buffer = layer.mesh._thinInstanceDataStorage.matrixData;
  layer.update(4, 0.5, 3); assert.equal(layer.mesh._thinInstanceDataStorage.matrixData, buffer);
  layer.update(4, 1, 3); layer.update(4, 0.5, 3);
  assert.deepEqual(layer.mesh.thinInstanceGetWorldMatrices().map(matrix => [...matrix.asArray()]), matrices);
  layer.dispose(); assert.equal(scene.meshes.length, 0); scene.dispose(); engine.dispose();
});

test("portable history stays outside renderer assets and saved snapshots", () => {
  const raw = { ...defaultVegetationAsset, archetypeLibrary: { versions: [{ asset: defaultVegetationAsset }] } };
  assert.equal("archetypeLibrary" in parseVegetationAsset(JSON.stringify(raw)), false);
});

const asset = () => structuredClone({ ...defaultVegetationAsset, primitives: defaultObjPrimitiveLibrary() });
const snapshot = (layer) => layer.meshes.map((mesh) => ({ name: mesh.name, positions: [...mesh.getVerticesData(VertexBuffer.PositionKind)], matrices: mesh.thinInstanceGetWorldMatrices().map((matrix) => [...matrix.asArray()]) }));

test("the supplied authored clover round-trips through independent hosts with calibrated coverage", () => {
  const clover = parseVegetationAsset(readFileSync(new URL("./fixtures/authored-clover.lamow-vegetation.json", import.meta.url), "utf8"));
  assert.equal(clover.species.id, "clover");
  for (let seed = 0; seed < 16; seed++) {
    const parts = compileVegetationPlant(clover, seed);
    assert.equal(parts.length, 4, "the authored three-leaf recipe takes precedence over the old shape summary");
    assert.ok(parts.every(p => p.positions.every(Number.isFinite)));
  }
  const placements = createVegetationPatchPlacements(clover, { width: 4, seed: 1 });
  assert.equal(placements.length, 2448);
  const engine = new NullEngine(), editorScene = new Scene(engine), hostScene = new Scene(engine);
  const editor = createVegetationSpeciesLayer({ scene: editorScene, asset: clover, groundHeightAt: () => 0 });
  const host = createVegetationSpeciesLayer({ scene: hostScene, asset: parseVegetationAsset(JSON.stringify(clover)), groundHeightAt: () => 0 });
  editor.setPlants(placements); host.setPlants(placements);
  assert.deepEqual(snapshot(editor), snapshot(host));
  const cut = host.mowCircle(0, 0, 0.45); assert.ok(cut > 0);
  host.resetMowed(); assert.deepEqual(snapshot(editor), snapshot(host));
  editor.dispose(); host.dispose(); editorScene.dispose(); hostScene.dispose(); engine.dispose();
});

test("signed travel, dimensions, fork offsets and scale retain their meaning through export", () => {
  const definition = asset();
  const marker = { id: "marker", type: "form", label: "Marker", primitive: "centerDisc", materialId: "center", width: { ideal: 0, deviation: 0 }, length: { ideal: 0, deviation: 0 } };
  const grow = { id: "travel", type: "continue", label: "Travel", distance: { ideal: -1, deviation: 0 }, arcDegrees: { ideal: 0, deviation: 0 }, formAlongPath: "stemSkin", radiusStart: { ideal: 0.01, deviation: 0 }, radiusEnd: { ideal: 0.02, deviation: 0 } };
  for (const mode of ["arc", "legacyDirection"]) {
    grow.pathMode = mode;
    definition.species.constructionRecipe.root = [grow, marker];
    const parts = compileVegetationPlant(parseVegetationAsset(JSON.stringify(definition)), 1);
    assert.ok(Vector3.Distance(Vector3.FromArray(parts[1].positions), new Vector3(0, -1, 0)) < 1e-7);
    assert.ok(parts[0].positions.filter((_, i) => i % 3 === 1).every(y => y <= 0 && y >= -1), "skin follows negative travel");
    definition.species.constructionRecipe.root = [grow, { ...grow, id: "return", distance: { ideal: 1, deviation: 0 } }, marker];
    assert.ok(Vector3.FromArray(compileVegetationPlant(definition, 1).at(-1).positions).length() < 1e-7, "reversing travel does not reverse the local frame");
  }
  const form = { ...marker, primitive: "leafBlade", width: { ideal: 0.2, deviation: 0 }, length: { ideal: 0.3, deviation: 0 } };
  definition.species.constructionRecipe.root = [form];
  const positive = compileVegetationPlant(definition, 1)[0];
  for (const property of ["width", "length"]) {
    form[property].ideal *= -1;
    const negative = compileVegetationPlant(parseVegetationAsset(JSON.stringify(definition)), 1)[0];
    negative.positions.forEach((v, i) => assert.ok(Math.abs(v - positive.positions[i] * ((property === "width" ? i % 3 === 0 : i % 3 !== 0) ? -1 : 1)) < 1e-7));
    assert.notDeepEqual(negative.positions, positive.positions);
    assert.equal(negative.indices[1], positive.indices[property === "width" ? 2 : 1], "odd reflections correct face winding");
    form[property].ideal *= -1;
  }
  definition.species.constructionRecipe.root = [{ id: "mirror", type: "steer", label: "Mirror", scale: { ideal: -1, deviation: 0 } }, form];
  const mirrored = compileVegetationPlant(definition, 1)[0];
  mirrored.positions.forEach((v, i) => assert.ok(Math.abs(v + positive.positions[i]) < 1e-7));
  definition.species.constructionRecipe.root = [{ id: "offset", type: "fork", label: "Offset", count: { ideal: 1, deviation: 0 }, layout: "radial", radius: { ideal: -0.5, deviation: 0 }, spreadDegrees: { ideal: 0, deviation: 0 }, continuation: [marker] }];
  assert.ok(Vector3.Distance(Vector3.FromArray(compileVegetationPlant(definition, 1)[0].positions), new Vector3(0, 0, -0.5)) < 1e-7);
});

test("signed radii and zero crossings keep geometry and normals finite, including legacy zero-start tapers", () => {
  const definition = asset();
  const grow = { id: "travel", type: "continue", label: "Travel", distance: { ideal: 0, deviation: 0 }, arcDegrees: { ideal: 45, deviation: 0 }, formAlongPath: "stemSkin" };
  definition.species.constructionRecipe.root = [grow];
  for (const pathMode of ["arc", "legacyDirection"]) for (const distance of [-0.2, 0, 0.2]) for (const start of [-0.02, 0, 0.02]) for (const end of [-0.02, 0, 0.02]) {
    Object.assign(grow, { pathMode, distance: { ideal: distance, deviation: 0 }, radiusStart: { ideal: start, deviation: 0 }, radiusEnd: { ideal: end, deviation: 0 } });
    const parts = compileVegetationPlant(parseVegetationAsset(JSON.stringify(definition)), 1);
    for (const part of parts) {
      const normals = []; VertexData.ComputeNormals(part.positions, part.indices, normals);
      assert.ok(part.positions.every(Number.isFinite)); assert.ok(normals.every(Number.isFinite));
      assert.ok(part.positions.every(v => Math.abs(v) < 1), "zero-start taper stays bounded");
    }
  }
  Object.assign(grow, { pathMode: "legacyDirection", distance: { ideal: -0.2, deviation: 0 }, radiusStart: { ideal: 0, deviation: 0 }, radiusEnd: { ideal: 0.02, deviation: 0 } });
  const backwardTaper = compileVegetationPlant(definition, 1)[0];
  grow.distance.ideal = 0.2;
  const forwardTaper = compileVegetationPlant(definition, 1)[0];
  assert.equal(backwardTaper.indices[1], forwardTaper.indices[2], "zero-start mirrored tapers also correct winding");
  Object.assign(grow, { pathMode: "arc", distance: { ideal: 0, deviation: 0.2 }, arcDegrees: { ideal: 0, deviation: 0 } });
  const y = Array.from({ length: 64 }, (_, seed) => compileVegetationPlant(definition, seed * 65537)[0].positions.filter((_, i) => i % 3 === 1));
  assert.ok(y.some(values => values.some(v => v > 0.01)) && y.some(values => values.some(v => v < -0.01)), "variation can travel either side of zero without clamping");
});

test("signed bends and deviations survive export and produce finite geometry across zero and both limits", () => {
  assert.ok(Vector3.Distance(stemGrowthVector(1, -90, 0), new Vector3(-1, 0, 0)) < 1e-7);
  const quarter = growthArcPose(Math.PI / 2, -90, 0);
  assert.ok(Vector3.Distance(quarter.position, new Vector3(-1, 1, 0)) < 1e-7);
  assert.ok(Vector3.Distance(Vector3.Up().rotateByQuaternionToRef(quarter.rotation, new Vector3()), new Vector3(-1, 0, 0)) < 1e-7);
  for (const mode of ["arc", "legacyDirection"]) for (const angle of [-180, -90, -1e-9, 0, 1e-9, 90, 180]) {
    const definition = asset(), grow = definition.species.constructionRecipe.root[0];
    grow.pathMode = mode; grow.arcDegrees = { ideal: angle, deviation: 180 };
    definition.species.constructionRecipe.root.push({ id: "signed-branch", type: "branch", label: "Signed branch", count: { ideal: 2, deviation: 0 }, layout: "alongPath", deviationDegrees: { ideal: angle, deviation: 180 }, aroundAxisDegrees: { ideal: -90, deviation: 180 }, offshoot: [
      { id: "signed-leaf", type: "form", label: "Leaf", primitive: "leafBlade", materialId: "stem", length: { ideal: 0.1, deviation: 0 }, width: { ideal: 0.05, deviation: 0 }, cup: { ideal: -1, deviation: 1 }, curl: { ideal: -1, deviation: 1 } },
    ] });
    const imported = parseVegetationAsset(JSON.stringify(definition));
    for (let seed = 0; seed < 16; seed++) {
      const parts = compileVegetationPlant(imported, seed);
      assert.ok(parts.length > 0);
      assert.ok(parts.every(part => part.positions.every(Number.isFinite)));
    }
    assert.deepEqual(compileVegetationPlant(imported, 3), compileVegetationPlant(definition, 3));
  }
  const definition = asset(), grow = definition.species.constructionRecipe.root[0];
  grow.arcDegrees = { ideal: -90, deviation: 0 };
  const negative = compileVegetationPlant(definition, 1);
  grow.arcDegrees.ideal = 90;
  assert.notDeepEqual(compileVegetationPlant(definition, 1), negative);
});

test("a reversed full radial fork has distinct attachment points instead of a duplicated endpoint", () => {
  const definition = asset();
  definition.species.constructionRecipe.root = [{ id: "reverse", type: "fork", label: "Reverse", count: { ideal: 4, deviation: 0 }, layout: "radial", spreadDegrees: { ideal: -360, deviation: 0 }, radius: { ideal: 1, deviation: 0 }, continuation: [
    { id: "point", type: "form", label: "Point", primitive: "centerDisc", materialId: "center", width: { ideal: 0, deviation: 0 }, length: { ideal: 0, deviation: 0 } },
  ] }];
  const points = compileVegetationPlant(definition, 1).map(part => Vector3.FromArray(part.positions));
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) assert.ok(Vector3.Distance(points[i], points[j]) > 1);
});

test("coverage calibration has physical units, stable subsets and portable round trips", () => {
  const definition = asset(); definition.species.coverage = { plantsPerSquareMeter: 40 };
  const full = createVegetationPatchPlacements(definition, { width: 4, seed: 73 });
  const half = createVegetationPatchPlacements(definition, { width: 4, seed: 73, density: 0.5 });
  assert.equal(full.length, 640); assert.equal(half.length, 320); assert.deepEqual(half, full.slice(0, half.length));
  assert.deepEqual(createVegetationPatchPlacements(parseVegetationAsset(JSON.stringify(definition)), { width: 4, seed: 73 }), full);
  assert.ok(full.every(p => Math.abs(p.x) <= 2 && Math.abs(p.z) <= 2));
  definition.species.coverage.plantsPerSquareMeter = 60;
  assert.deepEqual(createVegetationPatchPlacements(definition, { width: 4, seed: 73 }).slice(0, full.length), full);
  definition.species.coverage.plantsPerSquareMeter = -1;
  assert.throws(() => parseVegetationAsset(JSON.stringify(definition)), /coverage/);
});

test("continuous growth has the expected arc endpoint, transported tangent and straight/zero limits", () => {
  const near = (actual, expected) => assert.ok(Vector3.Distance(actual, expected) < 1e-7, `${actual} != ${expected}`);
  const quarter = growthArcPose(Math.PI / 2, 90, 0);
  near(quarter.position, new Vector3(1, 1, 0));
  near(Vector3.Up().rotateByQuaternionToRef(quarter.rotation, new Vector3()), Vector3.Right());
  near(growthArcPose(2, 0, 173).position, new Vector3(0, 2, 0));
  near(growthArcPose(0, 90, 90).position, Vector3.Zero());
  near(growthArcPose(Math.PI / 2, 90, 90).position, new Vector3(0, 1, 1));
  for (const angle of [-180, -45, 0, 1e-9, 45, 90, 180]) for (const azimuth of [0, 90, 180, 270]) for (const t of [0, 0.25, 0.5, 1]) {
    const pose = growthArcPose(1, angle, azimuth, t);
    assert.ok(pose.position.asArray().every(Number.isFinite));
    const dt = growthArcPose(1, angle, azimuth, t + 1e-6).position.subtract(pose.position).normalize();
    assert.ok(Vector3.Distance(dt, Vector3.Up().rotateByQuaternionToRef(pose.rotation, new Vector3())) < 1e-5);
  }
});

test("curved growth carries its endpoint into the next segment and branches use local path frames", () => {
  const definition = asset();
  const grow = { id: "curve", label: "Curve", type: "continue", pathMode: "arc", distance: { ideal: Math.PI / 2, deviation: 0 }, arcDegrees: { ideal: 90, deviation: 0 }, arcAzimuthDegrees: { ideal: 0, deviation: 0 }, formAlongPath: "none" };
  const marker = { id: "marker", label: "Marker", type: "form", primitive: "centerDisc", materialId: "center", length: { ideal: 0, deviation: 0 }, width: { ideal: 0, deviation: 0 } };
  definition.species.constructionRecipe.root = [grow, { ...grow, id: "straight", distance: { ideal: 1, deviation: 0 }, arcDegrees: { ideal: 0, deviation: 0 } }, marker];
  let parts = compileVegetationPlant(definition, 1);
  for (let i = 0; i < parts[0].positions.length; i += 3) assert.ok(Vector3.Distance(Vector3.FromArray(parts[0].positions, i), new Vector3(2, 1, 0)) < 1e-7);
  definition.species.constructionRecipe.root = [grow, { id: "branch", type: "branch", label: "Branch", count: { ideal: 1, deviation: 0 }, layout: "alongPath", deviationDegrees: { ideal: 0, deviation: 0 }, aroundAxisDegrees: { ideal: 0, deviation: 0 }, offshoot: [marker] }];
  parts = compileVegetationPlant(definition, 1);
  const midpoint = growthArcPose(Math.PI / 2, 90, 0, 0.5).position;
  assert.ok(Vector3.Distance(Vector3.FromArray(parts[0].positions), midpoint) < 1e-7);
});

test("portable export reproduces geometry, colors, and per-seed variation in a separate host", () => {
  const original = asset();
  original.primitives.find((p) => p.id === "saddlePetal").vertices[0].x = -0.83;
  original.primitives.find((p) => p.id === "saddlePetal").vertices[0].color = "#336699";
  const imported = parseVegetationAsset(JSON.stringify(original));
  assert.deepEqual(compileVegetationPlant(imported, 7), compileVegetationPlant(original, 7));
  assert.notDeepEqual(compileVegetationPlant(imported, 7), compileVegetationPlant(imported, 8));
  const engine = new NullEngine();
  const editorScene = new Scene(engine), gameScene = new Scene(engine);
  const editor = createVegetationSpeciesLayer({ scene: editorScene, asset: original, groundHeightAt: () => 0.25 });
  const game = createVegetationSpeciesLayer({ scene: gameScene, asset: imported, groundHeightAt: () => 0.25 });
  const placements = [{ x: 1, z: 2, seed: 7 }, { x: 3, z: 4, seed: 8 }];
  editor.setPlants(placements); game.setPlants(placements);
  assert.deepEqual(snapshot(editor), snapshot(game));
  editor.dispose(); game.dispose(); engine.dispose();
});

test("cup, curl, primitive vertices, material colors and nested recipe order reach the renderer", () => {
  const original = asset();
  const baseline = compileVegetationPlant(original, 1);
  for (const property of ["cup", "curl", "length", "width"]) {
    const changed = asset();
    changed.species.constructionRecipe.root[1].continuation[0][property].ideal += 0.2;
    assert.notDeepEqual(compileVegetationPlant(changed, 1), baseline, property);
  }
  const moved = asset();
  moved.species.constructionRecipe.root.reverse();
  assert.notDeepEqual(compileVegetationPlant(moved, 1), baseline);
  const empty = asset(); empty.species.constructionRecipe.root = [];
  assert.deepEqual(compileVegetationPlant(empty, 1), []);
  const choice = asset();
  choice.species.constructionRecipe.root = [{ id: "choice", type: "choose", label: "Choice", options: [
    { weight: 0, phrase: [{ id: "bad", type: "form", primitive: "missing", materialId: "petal" }] },
    { weight: 1, phrase: original.species.constructionRecipe.root },
  ] }];
  assert.ok(compileVegetationPlant(choice, 1).length > 0);
});

test("mowing and visibility survive edits; reset, empty populations and disposal release resources", () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const layer = createVegetationSpeciesLayer({ scene, asset: asset(), groundHeightAt: (x) => x / 10 });
  layer.setPlants([{ x: 1, z: 0, seed: 1 }, { x: 5, z: 0, seed: 1 }]);
  const before = snapshot(layer);
  assert.equal(layer.mowCircle(1, 0, 0.5), 1);
  assert.equal(layer.mowCircle(1, 0, 0.5), 0);
  assert.ok(snapshot(layer).every((batch) => batch.matrices[0].every((value) => value === 0)));
  layer.setVisible(0, true);
  assert.notDeepEqual(snapshot(layer), before);
  layer.setAsset(asset());
  assert.ok(snapshot(layer).every((batch) => batch.matrices[0].every((value) => value === 0)));
  layer.resetMowed(); assert.deepEqual(snapshot(layer), before);
  layer.setVisible(1, false); layer.setVisible(1, true); assert.deepEqual(snapshot(layer), before);
  layer.syncVisibility(1, 0, 1);
  assert.ok(snapshot(layer).every((batch) => batch.matrices[1].every((value) => value === 0)));
  layer.syncVisibility(1, 0, 10); assert.deepEqual(snapshot(layer), before);
  for (let i = 0; i < 5; i++) layer.setAsset(asset());
  assert.equal(scene.meshes.length, 3); assert.equal(scene.materials.filter((m) => m.name.startsWith("species-")).length, 3);
  layer.setPlants([]); assert.equal(scene.meshes.length, 0);
  layer.dispose(); layer.dispose();
  assert.equal(scene.materials.filter((m) => m.name.startsWith("species-")).length, 0);
  engine.dispose();
});

test("imports reject malformed recipes and primitives before rendering", () => {
  for (const mutate of [
    (v) => { v.species.constructionRecipe.root[0].distance = null; },
    (v) => { v.species.constructionRecipe.root[1].count.ideal = 100000; },
    (v) => { v.species.constructionRecipe.root[1].continuation = null; },
    (v) => { v.primitives[0].faces[0].vertices[0] = 99999; },
    (v) => { v.species.materials.petal.baseColor = "wrong"; },
    (v) => { v.species.instanceRanges.scale = null; },
  ]) {
    const value = asset(); mutate(value);
    assert.throws(() => parseVegetationAsset(JSON.stringify(value)));
  }
  const legacy = asset(); delete legacy.species.constructionRecipe; delete legacy.species.materials.center;
  assert.ok(parseVegetationAsset(JSON.stringify(legacy)).species.materials.center);
});

test("edits reuse resources, color changes preserve geometry, and invalid drafts preserve the visible plant", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const current = asset();
  const layer = createVegetationSpeciesLayer({ scene, asset: current, groundHeightAt: () => 0 });
  layer.setPlants([{ x: 0, z: 0, seed: 1 }]);
  const meshes = [...layer.meshes], materials = meshes.map((mesh) => mesh.material);
  const oldGeometry = snapshot(layer);
  current.species.constructionRecipe.root[1].continuation[0].length.ideal = 0.18;
  layer.setAsset(current);
  assert.deepEqual(layer.meshes, meshes);
  assert.notDeepEqual(snapshot(layer), oldGeometry);
  const updatedGeometry = snapshot(layer);
  current.species.materials.petal.baseColor = "#ff0000"; layer.setAsset(current);
  assert.deepEqual(snapshot(layer), updatedGeometry);
  assert.deepEqual(layer.meshes.map((mesh) => mesh.material), materials);
  const invalid = structuredClone(current);
  invalid.species.materials.petal.baseColor = "#00ff00";
  invalid.species.constructionRecipe.root.push({ id: "bad", type: "form", primitive: "missing", materialId: "petal" });
  assert.throws(() => layer.setAsset(invalid), /Missing primitive/);
  assert.deepEqual(snapshot(layer), updatedGeometry);
  assert.equal(layer.meshes.find(mesh=>mesh.name.endsWith("-petal")).material.diffuseColor.toHexString(),"#FF0000","rejected drafts cannot change visible colors");
  assert.doesNotThrow(()=>layer.setPlants([{x:0,z:0,seed:2}]),"rejected asset cannot poison later population edits");
  layer.setAsset(current); layer.dispose(); engine.dispose();
});

test("large valid sources render without argument overflow; copy and tessellation budgets reject early",()=>{
  const definition=asset(), vertexCount=45000;
  // Flat-shaded seams expand a legal 9,000-source-vertex OBJ to 45,000 render vertices.
  const source={id:"leafBlade",displayName:"Large source",vertices:Array.from({length:9000},(_,i)=>({id:String(i),x:(i%3===1?1:0),y:(i%3===2?1:0),z:Math.floor(i/3)/vertexCount,color:"#ffffff"})),faces:Array.from({length:vertexCount/3},(_,i)=>({vertices:[i*3%9000,(i*3+1)%9000,(i*3+2)%9000],smoothingGroup:null})),sharpEdges:[]};
  const form={id:"large",label:"Large",type:"form",primitive:"leafBlade",materialId:"petal",width:{ideal:0.1,deviation:0},length:{ideal:0.1,deviation:0}};
  definition.primitives=[source];definition.species.constructionRecipe.root=[form];
  const valid=parseVegetationAsset(JSON.stringify(definition));
  const engine=new NullEngine(),scene=new Scene(engine),layer=createVegetationSpeciesLayer({scene,asset:valid,groundHeightAt:()=>0});
  try{
    layer.setPlants([{x:0,z:0,seed:0}]);assert.equal(layer.meshes[0].getTotalVertices(),vertexCount);
    assert.ok(layer.meshes[0].getVerticesData("normal").every(Number.isFinite));
    const before=snapshot(layer),tooMany=structuredClone(valid);
    tooMany.species.constructionRecipe.root=[{id:"copies",label:"Copies",type:"fork",layout:"radial",count:{ideal:3,deviation:0},continuation:[form]}];
    assert.throws(()=>layer.setAsset(tooMany),/rendered vertices/);assert.deepEqual(snapshot(layer),before);
    const curved=structuredClone(valid);curved.primitives[0].id="stemSkin";
    curved.species.constructionRecipe.root=[{id:"curve",label:"Curve",type:"continue",pathMode:"arc",distance:{ideal:1,deviation:0},arcDegrees:{ideal:360,deviation:0},formAlongPath:"stemSkin"}];
    assert.throws(()=>compileVegetationPlant(curved),/tessellation budget/);
    layer.setPlants([{x:1,z:0,seed:0}]);assert.equal(layer.meshes[0].getTotalVertices(),vertexCount);
  }finally{layer.dispose();scene.dispose();engine.dispose();}
});

test("all supported fork and branch layouts have distinct geometry with zero random variation", () => {
  const current = asset();
  current.species.constructionRecipe.root[1].count = { ideal: 5, deviation: 0 };
  const layouts = ["radial", "spiral", "mirrored", "cluster", "sameAxis"].map((layout) => {
    const next = structuredClone(current); next.species.constructionRecipe.root[1].layout = layout;
    return JSON.stringify(compileVegetationPlant(next, 1));
  });
  assert.equal(new Set(layouts).size, layouts.length);
  const spiral = structuredClone(current); spiral.species.constructionRecipe.root[1].layout = "spiral";
  const before = compileVegetationPlant(spiral, 1);
  spiral.species.constructionRecipe.root[1].spreadDegrees.ideal = 160;
  assert.notDeepEqual(compileVegetationPlant(spiral, 1), before);
  const fork = current.species.constructionRecipe.root[1];
  current.species.constructionRecipe.root[1] = { id: "branch", type: "branch", count: { ideal: 4, deviation: 0 }, layout: "alongPath", offshoot: fork.continuation };
  const branchLayouts = ["alongPath", "radial", "alternating", "tip"].map((layout) => {
    const next = structuredClone(current); next.species.constructionRecipe.root[1].layout = layout;
    return JSON.stringify(compileVegetationPlant(next, 1));
  });
  assert.equal(new Set(branchLayouts).size, branchLayouts.length);
});
