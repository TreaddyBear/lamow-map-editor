import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, Matrix, MeshBuilder, Plane, Ray, Scene, ShaderMaterial, StandardMaterial, Texture, Vector3 } from "@babylonjs/core";
import { createVegetationSpeciesLayer, createVegetationPatchPlacements, parseVegetationAsset, type VegetationSpeciesAssetFile } from "@lamow/landscape-renderer";
import { createPreviewField, type FieldPoint, type PreviewBrushMode } from "@lamow/landscape-renderer/vegetation/previewField";
import { createBrushMotion } from "@lamow/landscape-renderer/vegetation/brushMotion";
import { createReferenceGrass } from "@lamow/landscape-renderer/vegetation/referenceGrass";
import { createCutRemnants } from "@lamow/landscape-renderer/vegetation/cutRemnants";
import { gameGrassSettings, gameGroundSize } from "@lamow/landscape-renderer/vegetation/gameReference/settings";
import dirtUrl from "@lamow/landscape-renderer/assets/Dirt_02.png?url";
import dirtNormalUrl from "@lamow/landscape-renderer/assets/Dirt_02_Nrm.png?url";
import grassUrl from "@lamow/landscape-renderer/assets/ground-grassy.png?url";
export type { PreviewBrushMode } from "@lamow/landscape-renderer/vegetation/previewField";

/** Interactive host, deliberately separate from the builder's comparison views. */
export function createVegetationPlaytest(canvas: HTMLCanvasElement, input: VegetationSpeciesAssetFile, onCount: (count: number) => void) {
  const asset = parseVegetationAsset(JSON.stringify(input));
  const patchWidth = asset.editor?.preview?.groundPatchMeters ?? 4, width = patchWidth * 2, seed = asset.editor?.preview?.populationSeed ?? 1;
  // Preserve the authored patch's exact placements; add planting space around it.
  const plants = [...createVegetationPatchPlacements(asset, { width: patchWidth, seed }), ...createVegetationPatchPlacements(asset, { width, seed }).filter(p => Math.abs(p.x) > patchWidth / 2 || Math.abs(p.z) > patchWidth / 2)];
  const engine = new Engine(canvas, true); engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine); scene.clearColor = new Color4(0.8, 0.87, 0.91, 1);
  try {
    const camera = new ArcRotateCamera("playtest-camera", -Math.PI / 2.4, Math.PI / 3.1, width * 1.15, Vector3.Zero(), scene);
    camera.minZ = 0.01; camera.lowerRadiusLimit = 0.5; camera.upperRadiusLimit = width * 4;
    const light = new HemisphericLight("playtest-light", new Vector3(-0.45, 1, 0.24), scene); light.intensity = 0.95; light.groundColor = Color3.FromHexString("#55664a");
    const field = createPreviewField(width, 0);
    for (const surface of ["dirt", "grass"] as const) {
      const size = surface === "dirt" ? Math.max(100, width * 4) : width;
      const ground = MeshBuilder.CreateGround("playtest-ground-" + surface, { width: size, height: size }, scene);
      const material = new StandardMaterial("playtest-ground-material-" + surface, scene); material.specularColor = Color3.Black();
      const texture = new Texture(surface === "grass" ? grassUrl : dirtUrl, scene);
      texture.uScale = size * (surface === "grass" ? gameGrassSettings.grassyTextureScale : gameGrassSettings.dirtTextureUScale) / gameGroundSize.width;
      texture.vScale = size * (surface === "grass" ? gameGrassSettings.grassyTextureScale : gameGrassSettings.dirtTextureVScale) / gameGroundSize.height;
      material.diffuseTexture = texture;
      if (surface === "grass") { ground.position.y = 0.002; }
      else { const normal = new Texture(dirtNormalUrl, scene); normal.uScale = texture.uScale; normal.vScale = texture.vScale; normal.level = gameGrassSettings.dirtNormalStrength; material.bumpTexture = normal; }
      ground.material = material;
    }
    const layer = createVegetationSpeciesLayer({ scene, asset, groundHeightAt: () => 0 }); layer.setPlants(plants);
    const grass = createReferenceGrass(scene); grass.update(width, 1, seed);
    const grassPositions = grass.mesh.thinInstanceGetWorldMatrices().map(m => ({ x: m.m[12], z: m.m[14] }));
    const cutAppearance = asset.species.cutAppearance ?? { style: "stems" as const, height: 0.085 };
    const cutGrass = createCutRemnants(scene, grassPositions, { style: "grass", height: cutAppearance.style === "grass" ? cutAppearance.height : 0.05, color: cutAppearance.style === "grass" ? cutAppearance.color : undefined }, "playtest-cut-grass");
    const cutStems = cutAppearance.style === "stems" ? createCutRemnants(scene, plants, { ...cutAppearance, color: cutAppearance.color ?? asset.species.materials.stem?.baseColor }, "playtest-cut-stems") : undefined;
    const rank = (x: number, z: number) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
    const motions = [...layer.meshes.map(mesh => createBrushMotion(mesh, "plant", mesh.thinInstanceGetWorldMatrices().map(m => rank(m.m[12], m.m[14])))), createBrushMotion(grass.mesh, "grass", grass.mesh.thinInstanceGetWorldMatrices().map(m => rank(m.m[12], m.m[14])), [{ kind: "color", stride: 4, data: grass.colors }])];
    const ring = MeshBuilder.CreateTorus("mow-radius", { diameter: 2, thickness: 0.012, tessellation: 64 }, scene);
    ring.renderingGroupId = 1;
    const ringMaterial = new StandardMaterial("mow-radius-material", scene); ringMaterial.disableLighting = true; ring.material = ringMaterial; ring.isPickable = false; ring.setEnabled(false);
    const outside = MeshBuilder.CreateDisc("brush-outside", { radius: 1, tessellation: 48 }, scene); outside.rotation.x = Math.PI / 2; outside.renderingGroupId = 1; outside.isPickable = false; outside.setEnabled(false);
    outside.material = new ShaderMaterial("brush-outside-material", scene, { vertexSource: "precision highp float;attribute vec3 position;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec2 vUV;void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}", fragmentSource: "precision highp float;varying vec2 vUV;void main(){float stripe=step(0.5,fract((vUV.x+vUV.y)*12.0));gl_FragColor=vec4(0.85,0.18,0.12,0.06+stripe*0.14);}" }, { attributes: ["position", "uv"], uniforms: ["worldViewProjection"], needAlphaBlending: true }); outside.material.backFaceCulling = false;
    let mode: PreviewBrushMode = "cut", radius = 0.45, softness = 0.5, frames = 3, lastFrame = performance.now();
    let stroke: { id: number; last?: FieldPoint } | undefined, drag: { id: number; x: number; y: number; pan: boolean } | undefined;
    let pending: { from: FieldPoint; to: FieldPoint; mode: PreviewBrushMode; radius: number; softness: number }[] = [];
    const requestRender = () => { frames = 3; };
    const publish = () => {
      motions.forEach(motion => motion.applyField(field));
      cutGrass.setVisible(i => field.sample(grassPositions[i].x, grassPositions[i].z).cut);
      cutStems?.setVisible(i => { const p = plants[i], state = field.sample(p.x, p.z); return state.cut && rank(Math.fround(p.x), Math.fround(p.z)) < state.density; });
      let count = 0; for (const plant of plants) { const state = field.sample(plant.x, plant.z); if (rank(Math.fround(plant.x), Math.fround(plant.z)) < state.density && !state.cut) count++; }
      onCount(count); canvas.dataset.plantCount = String(count); canvas.dataset.fieldRevision = String(field.revision);
      requestRender();
    };
    const clearHover = () => { motions.forEach(motion => motion.hover(undefined)); ring.setEnabled(false); outside.setEnabled(false); requestRender(); };
    const release = () => { stroke = undefined; drag = undefined; };
    const cancel = () => { release(); pending = []; clearHover(); };
    const reset = () => {
      cancel(); field.reset(0);
      for (let z = field.resolution / 4; z < field.resolution * 3 / 4; z++) field.density.fill(1, z * field.resolution + field.resolution / 4, z * field.resolution + field.resolution * 3 / 4);
      publish();
    };
    const pick = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      const ray = Ray.CreateNew(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, Matrix.Identity(), camera.getViewMatrix(), camera.getProjectionMatrix());
      const distance = ray.intersectsPlane(new Plane(0, 1, 0, 0)); if (distance === null || distance < 0) return;
      const p = ray.origin.add(ray.direction.scale(distance));
      return { x: p.x, z: p.z };
    };
    const hover = (event: PointerEvent) => {
      const point = mode === "camera" ? undefined : pick(event), valid = Boolean(point && Math.abs(point.x) <= width / 2 && Math.abs(point.z) <= width / 2);
      motions.forEach(motion => motion.hover(mode === "cut" && valid ? point : undefined, radius)); ring.setEnabled(Boolean(point)); outside.setEnabled(Boolean(point && !valid));
      canvas.dataset.brushValid = String(valid);
      ringMaterial.emissiveColor = Color3.FromHexString(!valid ? "#de705e" : mode === "cut" ? "#ffe28a" : "#9eeaa1");
      if (point) { ring.position.set(point.x, 0.015, point.z); ring.scaling.setAll(radius); outside.position.copyFrom(ring.position); outside.scaling.setAll(radius); } requestRender(); return valid ? point : undefined;
    };
    const down = (event: PointerEvent) => {
      if (![0, 2].includes(event.button)) return; event.preventDefault(); canvas.setPointerCapture(event.pointerId);
      if (event.button === 0 && mode !== "camera") { const point = hover(event); stroke = { id: event.pointerId, last: point }; if (point) pending.push({ from: point, to: point, mode, radius, softness }); }
      else { clearHover(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 }; }
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) { const point = hover(event); if (stroke?.id === event.pointerId) { if (point) pending.push({ from: stroke.last ?? point, to: point, mode, radius, softness }); stroke.last = point; } return; }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (drag.pan) {
        const forward = camera.target.subtract(camera.position).normalize(), right = Vector3.Cross(forward, Vector3.Up()).normalize(), up = Vector3.Cross(right, forward).normalize();
        const scale = 2 * camera.radius * Math.tan(camera.fov / 2) / Math.max(1, canvas.clientHeight), { alpha, beta, radius: distance } = camera;
        camera.setTarget(camera.target.add(right.scale(-dx * scale)).add(up.scale(dy * scale))); camera.alpha = alpha; camera.beta = beta; camera.radius = distance;
      } else { camera.alpha -= dx * 0.007; camera.beta = Math.max(0.02, Math.min(Math.PI / 2 - 0.015, camera.beta - dy * 0.007)); }
      drag.x = event.clientX; drag.y = event.clientY; requestRender();
    };
    const wheel = (event: WheelEvent) => { event.preventDefault(); camera.radius = Math.max(0.5, Math.min(width * 4, camera.radius * Math.exp(Math.max(-150, Math.min(150, event.deltaY)) * 0.0015))); requestRender(); };
    const context = (event: Event) => event.preventDefault(), visibility = () => { if (document.hidden) cancel(); else requestRender(); };
    const resize = new ResizeObserver(() => { engine.resize(); requestRender(); }); resize.observe(canvas);
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", release); canvas.addEventListener("lostpointercapture", release); canvas.addEventListener("pointercancel", cancel); canvas.addEventListener("pointerleave", clearHover); canvas.addEventListener("wheel", wheel, { passive: false }); canvas.addEventListener("contextmenu", context);
    window.addEventListener("blur", cancel); window.addEventListener("pointerup", release); document.addEventListener("visibilitychange", visibility);
    reset();
    engine.runRenderLoop(() => {
      if (document.hidden || frames <= 0) return;
      const now = performance.now(), dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
      let changed = false; for (const entry of pending) if (field.stroke(entry.from, entry.to, entry.radius, entry.mode, entry.softness)) changed = true; pending = [];
      if (changed) publish(); let moving = false; motions.forEach(motion => { if (motion.tick(dt)) moving = true; });
      canvas.dataset.interactionMs = (performance.now() - now).toFixed(2); if (moving) frames = 3;
      frames--; const renderStart = performance.now(); scene.render(); canvas.dataset.renderMs = (performance.now() - renderStart).toFixed(2);
    });
    scene.executeWhenReady(requestRender);
    return {
      reset,
      setBrush(nextMode: PreviewBrushMode, nextRadius: number, nextSoftness: number) { cancel(); mode = nextMode; radius = Math.max(0.1, Math.min(1.5, nextRadius)); softness = Math.max(0, Math.min(1, nextSoftness)); canvas.dataset.brushMode = mode; },
      dispose() { cancel(); resize.disconnect(); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", release); canvas.removeEventListener("lostpointercapture", release); canvas.removeEventListener("pointercancel", cancel); canvas.removeEventListener("pointerleave", clearHover); canvas.removeEventListener("wheel", wheel); canvas.removeEventListener("contextmenu", context); window.removeEventListener("blur", cancel); window.removeEventListener("pointerup", release); document.removeEventListener("visibilitychange", visibility); layer.dispose(); grass.dispose(); scene.dispose(); engine.dispose(); },
    };
  } catch (error) { scene.dispose(); engine.dispose(); throw error; }
}
