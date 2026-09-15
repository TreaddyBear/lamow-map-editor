import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, MeshBuilder, RawTexture, Scene, StandardMaterial, Texture, Vector3, Viewport } from "@babylonjs/core";
import { createVegetationSpeciesLayer, createVegetationPatchPlacements, fullCoverage } from "@lamow/landscape-renderer";
import type { VegetationGeometryCache } from "@lamow/landscape-renderer/vegetation/speciesLayer";
import { createGrassBake } from "@lamow/landscape-renderer/vegetation/grassBake";
import { createVegetationSlatLayer } from "@lamow/landscape-renderer/vegetation/slats";
import type { GrassLodSettings, GrowthPhrase, VegetationSpeciesAssetFile } from "../utilities/assets/vegetation";
import { createReferenceGrass } from "@lamow/landscape-renderer/vegetation/referenceGrass";
import { defaultGrassLodSettings } from "../utilities/assets/vegetation";
import { gameGrassSettings, gameGroundSize } from "@lamow/landscape-renderer/vegetation/gameReference/settings";
import dirtTextureUrl from "@lamow/landscape-renderer/assets/Dirt_02.png?url";
import dirtNormalUrl from "@lamow/landscape-renderer/assets/Dirt_02_Nrm.png?url";
import grassTextureUrl from "@lamow/landscape-renderer/assets/ground-grassy.png?url";

export const previewPaneIds = ["plant", "half", "full", "lod-half", "lod-full"] as const;
export type PreviewPaneId = typeof previewPaneIds[number];
export type PreviewAngle = "perspective" | "top" | "side";

/** One engine, one scene, independent camera viewports. No React work inside the render loop. */
export function createVegetationWorkspace(canvas: HTMLCanvasElement, elements: Map<PreviewPaneId, HTMLElement>, initial: VegetationSpeciesAssetFile) {
  const engine = new Engine(canvas, true); engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine); scene.clearColor = new Color4(0.84, 0.9, 0.82, 1);
  const cache: VegetationGeometryCache = { plants: new Map() };
  const cameras = previewPaneIds.map((id, i) => {
    const camera = new ArcRotateCamera("vegetation-camera-" + id, -Math.PI / 2.4, i >= 3 ? 0.72 : Math.PI / 3, i ? 8 : 0.7, new Vector3(0, i ? 0 : 0.1, 0), scene);
    camera.layerMask = 1 << i; camera.minZ = 0.001; camera.lowerRadiusLimit = 0.04; camera.upperRadiusLimit = 100;
    return camera;
  });
  scene.activeCameras = cameras; scene.activeCamera = cameras[0];
  const light = new HemisphericLight("vegetation-light", new Vector3(-0.45, 1, 0.24), scene); light.intensity = 0.95;
  light.groundColor = Color3.FromHexString("#55664a");
  const grounds = ["plain", "grass", "dirt"].map((surface, index) => {
    const mesh = MeshBuilder.CreateGround("vegetation-ground-" + surface, { width: 100, height: 100 }, scene);
    const material = new StandardMaterial("vegetation-ground-material-" + surface, scene);
    material.specularColor = Color3.Black(); material.diffuseColor = surface === "plain" ? Color3.FromHexString("#aec298") : Color3.White();
    if (surface !== "plain") {
      const texture = new Texture(surface === "grass" ? grassTextureUrl : dirtTextureUrl, scene);
      texture.uScale = 100 * (surface === "grass" ? gameGrassSettings.grassyTextureScale : gameGrassSettings.dirtTextureUScale) / gameGroundSize.width;
      texture.vScale = 100 * (surface === "grass" ? gameGrassSettings.grassyTextureScale : gameGrassSettings.dirtTextureVScale) / gameGroundSize.height;
      material.diffuseTexture = texture;
      if (surface === "dirt") {
        const normal = new Texture(dirtNormalUrl, scene); normal.uScale = texture.uScale; normal.vScale = texture.vScale;
        normal.level = gameGrassSettings.dirtNormalStrength; material.bumpTexture = normal;
      }
    }
    mesh.material = material; mesh.layerMask = index === 2 ? 1 : index === 1 ? 30 : 0; return mesh;
  });
  const layers = [1, 2, 4].map(layerMask => createVegetationSpeciesLayer({ scene, asset: initial, groundHeightAt: () => 0, layerMask, geometryCache: cache }));
  const bake = createGrassBake(scene);
  const mow = RawTexture.CreateRGBATexture(new Uint8Array([0, 0, 0, 255]), 1, 1, scene, false, false);
  const slats = [8, 16].map(mask => createVegetationSlatLayer(scene, bake, mow, mask));
  const coverageGrass = createReferenceGrass(scene);
  const slatCoverage = [0.5, 1];
  let frames = 3, visible = true, placementKey = "", species = "", width = 4, selected = "", asset = initial, seed = 1;
  let disposed = false;
  const requestRender = () => { frames = 3; };
  const paneIndex = (id: PreviewPaneId) => previewPaneIds.indexOf(id);
  const focus = (fit: boolean) => {
    const camera = cameras[0], alpha = camera.alpha, beta = camera.beta, radius = camera.radius;
    const ids = new Set<string>();
    const gather = (phrases: GrowthPhrase[], inside = false) => { for (const phrase of phrases) {
      const match = inside || phrase.id === selected; if (match) ids.add(phrase.id);
      if (phrase.type === "fork") gather(phrase.continuation, match);
      if (phrase.type === "branch") gather(phrase.offshoot, match);
      if (phrase.type === "choose") phrase.options.forEach(option => gather(option.phrase, match));
    } };
    gather(asset.species.constructionRecipe?.root ?? []);
    let parts = cache.plants.get((seed >>> 0) % 16) ?? [];
    const wholePlant = parts;
    if (ids.size && parts.some(part => ids.has(part.phraseId))) parts = parts.filter(part => ids.has(part.phraseId));
    let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const part of parts) for (let i = 0; i < part.positions.length; i += 3) { const p = Vector3.FromArray(part.positions, i); min = Vector3.Minimize(min, p); max = Vector3.Maximize(max, p); }
    if (Number.isFinite(min.x)) {
      camera.setTarget(min.add(max).scale(0.5));
      let extent = 0;
      if (fit) for (const part of wholePlant) for (let i = 0; i < part.positions.length; i += 3) extent = Math.max(extent, Vector3.Distance(camera.target, Vector3.FromArray(part.positions, i)));
      camera.radius = fit ? Math.max(0.25, extent * 3 / Math.min(1, engine.getAspectRatio(camera))) : radius;
    }
    camera.alpha = alpha; camera.beta = beta;
  };
  const fit = (id: PreviewPaneId) => {
    const i = paneIndex(id), camera = cameras[i];
    if (i === 0) focus(true);
    else { const alpha = camera.alpha, beta = camera.beta; camera.setTarget(new Vector3(0, 0.1, 0)); camera.alpha = alpha; camera.beta = beta; camera.radius = width * (i >= 3 ? 2.3 : 1.15) / Math.min(1, engine.getAspectRatio(camera)); }
    requestRender();
  };
  const resize = () => {
    engine.resize(); const board = canvas.getBoundingClientRect();
    if (!board.width || !board.height) return;
    previewPaneIds.forEach((id, i) => { const rect = elements.get(id)!.getBoundingClientRect(); cameras[i].viewport = new Viewport((rect.left - board.left) / board.width, 1 - (rect.bottom - board.top) / board.height, rect.width / board.width, rect.height / board.height); });
    requestRender();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas); elements.forEach(element => observer.observe(element)); resize();
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) requestRender(); }); intersection.observe(canvas);
  const visibility = () => { if (!document.hidden) requestRender(); }; document.addEventListener("visibilitychange", visibility);
  const cleanup: (() => void)[] = [];
  elements.forEach((element, id) => {
    const camera = cameras[paneIndex(id)]; let drag: { id: number; x: number; y: number; pan: boolean } | undefined;
    const down = (event: PointerEvent) => { if (![0, 2].includes(event.button) || (event.target as HTMLElement).closest("button,input,[role=menu]")) return; event.preventDefault(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 }; element.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (drag.pan) {
        const forward = camera.target.subtract(camera.position).normalize(), right = Vector3.Cross(forward, Vector3.Up()).normalize(), up = Vector3.Cross(right, forward).normalize();
        const scale = 2 * camera.radius * Math.tan(camera.fov / 2) / Math.max(1, element.clientHeight);
        const alpha = camera.alpha, beta = camera.beta, radius = camera.radius;
        camera.setTarget(camera.target.add(right.scale(-dx * scale)).add(up.scale(dy * scale)));
        camera.alpha = alpha; camera.beta = beta; camera.radius = radius;
      } else { camera.alpha -= dx * 0.007; camera.beta = Math.max(0.02, Math.min(Math.PI / 2 - 0.015, camera.beta - dy * 0.007)); }
      drag.x = event.clientX; drag.y = event.clientY; requestRender();
    };
    const up = () => { drag = undefined; };
    const wheel = (event: WheelEvent) => { if ((event.target as HTMLElement).closest("button,input")) return; event.preventDefault(); camera.radius = Math.max(0.04, Math.min(100, camera.radius * Math.exp(Math.max(-150, Math.min(150, event.deltaY)) * 0.0015))); requestRender(); };
    element.addEventListener("pointerdown", down); element.addEventListener("pointermove", move); element.addEventListener("pointerup", up); element.addEventListener("lostpointercapture", up); element.addEventListener("wheel", wheel, { passive: false });
    cleanup.push(() => { element.removeEventListener("pointerdown", down); element.removeEventListener("pointermove", move); element.removeEventListener("pointerup", up); element.removeEventListener("lostpointercapture", up); element.removeEventListener("wheel", wheel); });
  });
  engine.runRenderLoop(() => {
    if (!visible || document.hidden || frames <= 0) return;
    frames--; const start = performance.now(); scene.render(); canvas.dataset.renderMs = (performance.now() - start).toFixed(2);
  });
  return {
    fit,
    setGround(id: PreviewPaneId, surface: "plain" | "grass" | "dirt") {
      const mask = 1 << paneIndex(id), selected = ["plain", "grass", "dirt"].indexOf(surface);
      grounds.forEach((mesh, index) => { mesh.layerMask = index === selected ? mesh.layerMask | mask : mesh.layerMask & ~mask; }); requestRender();
    },
    setSlatCoverage(id: PreviewPaneId, coverage: number) {
      const index = id === "lod-half" ? 0 : 1; slatCoverage[index] = coverage;
      slats[index].update(asset, asset.editor?.grassLod ?? defaultGrassLodSettings, Math.max(24, width * 4), coverage); requestRender();
    },
    setAngle(id: PreviewPaneId, angle: PreviewAngle) { const camera = cameras[paneIndex(id)]; camera.alpha = -Math.PI / 2.4; camera.beta = angle === "top" ? 0.035 : angle === "side" ? Math.PI / 2.12 : id.startsWith("lod-") ? 0.72 : Math.PI / 3; requestRender(); },
    update(next: VegetationSpeciesAssetFile, grass: GrassLodSettings, selection: string) {
      if (disposed) return;
      const start = performance.now(), changedSpecies = species !== next.species.id, changedSelection = selection !== selected;
      asset = next; selected = selection; species = next.species.id; seed = next.editor?.preview?.populationSeed ?? 1; width = next.editor?.preview?.groundPatchMeters ?? 4;
      layers.forEach(layer => layer.setAsset(next));
      const key = seed + ":" + width + ":" + fullCoverage(next);
      if (key !== placementKey) {
        layers[0].setPlants([{ x: 0, z: 0, seed, yaw: 0, scale: 1 }]);
        const all = createVegetationPatchPlacements(next, { width, seed });
        layers[1].setPlants(all.slice(0, Math.round(all.length / 2))); layers[2].setPlants(all);
        elements.get("half")!.dataset.plantCount = String(Math.round(all.length / 2)); elements.get("full")!.dataset.plantCount = String(all.length);
        placementKey = key;
      }
      slats.forEach((layer, i) => layer.update(next, grass, Math.max(24, width * 4), slatCoverage[i]));
      coverageGrass.update(width, 0.5, seed);
      if (changedSpecies) previewPaneIds.forEach(fit);
      else if (changedSelection) focus(false);
      canvas.dataset.updateMs = (performance.now() - start).toFixed(2);
      requestRender(); scene.executeWhenReady(requestRender);
    },
    dispose() { disposed = true; cleanup.forEach(fn => fn()); observer.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", visibility); layers.forEach(layer => layer.dispose()); slats.forEach(layer => layer.dispose()); coverageGrass.dispose(); mow.dispose(); bake.normalTex.dispose(); bake.albedoTex.dispose(); scene.dispose(); engine.dispose(); },
  };
}
