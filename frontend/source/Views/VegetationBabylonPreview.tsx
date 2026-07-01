import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArcRotateCamera, Color3, Color4, DynamicTexture, Effect, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, Quaternion, Scene, ShaderMaterial, StandardMaterial, TransformNode, Vector3, VertexData, Viewport } from "@babylonjs/core";
import { Asterisk, CircleDot, Crosshair, Flower, Flower2, GalleryHorizontal, Grid2x2, Grid3x3, LayoutGrid, Leaf, PanelRight } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../Components/Base";
import { recipeToFieldFlowerShape, type BranchPhrase, type FieldFlowerShapeDefinition, type FormPhrase, type ForkPhrase, type GrassLodSettings, type GrowthPhrase, type VegetationSpeciesAssetFile } from "../utilities/assets/vegetation";

type Props = {
  asset: VegetationSpeciesAssetFile;
  grass: GrassLodSettings;
  mode?: PreviewMode;
  focusPhraseId?: string;
};

type RecipeFlowerPreview = {
  shape: FieldFlowerShapeDefinition;
  hasStem: boolean;
  hasPetals: boolean;
  hasCenter: boolean;
  stemArcDegrees: number;
  stemArcAzimuthDegrees: number;
  leaf?: RecipeLeafPreview;
};
type RecipeLeafPreview = {
  count: number;
  length: number;
  width: number;
  curl: number;
  deviationDegrees: number;
  aroundAxisDegrees: number;
  layout: BranchPhrase["layout"];
  materialId: string;
};
type CloverShape = Extract<VegetationSpeciesAssetFile["species"]["parts"][0]["shape"], { type: "cloverCluster" }>;
type TallFlowerShape = Extract<VegetationSpeciesAssetFile["species"]["parts"][0]["shape"], { type: "tallFlower" }>;
type PreviewRuntime = {
  engine: Engine;
  scene: Scene;
  roots: TransformNode[];
  cameras: ArcRotateCamera[];
  fieldBoard?: FieldFlowerBoardHandle;
};
type FieldFlowerBoardHandle = {
  roots: Record<PreviewMode, TransformNode>;
  cameras: ArcRotateCamera[];
  closeup: FieldFlowerCloseupHandle;
  population50: FieldFlowerPopulationHandle;
  population100: FieldFlowerPopulationHandle;
  slats50: FieldFlowerSlatHandle;
  slats100: FieldFlowerSlatHandle;
};
type FieldFlowerCloseupHandle = {
  root: TransformNode;
  stem: Mesh;
  center: Mesh;
  petalSource: Mesh;
  petals: Mesh[];
  leafSource: Mesh;
  leaves: Mesh[];
  stemMaterial: StandardMaterial;
  centerMaterial: StandardMaterial;
  petalMaterial: StandardMaterial;
  leafMaterial: StandardMaterial;
};
type FieldFlowerPopulationHandle = {
  stem: Mesh;
  center: Mesh;
  petal: Mesh;
  leaf: Mesh;
  stemMaterial: StandardMaterial;
  centerMaterial: StandardMaterial;
  petalMaterial: StandardMaterial;
  leafMaterial: StandardMaterial;
};
type FieldFlowerSlatHandle = {
  markers: Mesh[];
  markerMaterial: StandardMaterial;
  slatMesh: Mesh;
  slatMaterial?: ShaderMaterial;
};
type CloseupViewMode = "head" | "side";
type PaneIconRole = "head" | "side" | "density" | "slats";
type PaneIconOption = { value: string; label: string; icon: ReactNode };

export type PreviewMode = "flowerCloseup" | "population50" | "population100" | "slats50" | "slats100";

const previewModes: PreviewMode[] = ["flowerCloseup", "population50", "population100", "slats50", "slats100"];
const previewLabels = {
  flowerCloseup: "Flower Closeup",
  population50: "500 Vegetation - 50%",
  population100: "1000 Vegetation - 100%",
  slats50: "Slats - 50% Grass / 50% Vegetation",
  slats100: "Slats - 100% Vegetation",
} satisfies Record<PreviewMode, string>;
const previewMasks = {
  flowerCloseup: 0x10000000,
  population50: 0x20000000,
  population100: 0x40000000,
  slats50: 0x08000000,
  slats100: 0x04000000,
} satisfies Record<PreviewMode, number>;
const defaultPaneIcons = {
  head: "flower",
  side: "panel",
  density: "quincunx",
  slats: "waffle",
} satisfies Record<PaneIconRole, string>;
const paneIconOptions = {
  head: [
    { value: "flower", label: "Flower", icon: <Flower /> },
    { value: "flower2", label: "Flower 2", icon: <Flower2 /> },
    { value: "asterisk", label: "Asterisk", icon: <Asterisk /> },
    { value: "circle", label: "Circle", icon: <CircleDot /> },
  ],
  side: [
    { value: "panel", label: "Panel", icon: <PanelRight /> },
    { value: "profile", label: "Profile", icon: <GalleryHorizontal /> },
    { value: "leaf", label: "Leaf", icon: <Leaf /> },
  ],
  density: [
    { value: "quincunx", label: "Quincunx", icon: <QuincunxIcon /> },
    { value: "grid3", label: "Grid", icon: <Grid3x3 /> },
    { value: "layout", label: "Layout", icon: <LayoutGrid /> },
    { value: "circle", label: "Circle", icon: <CircleDot /> },
  ],
  slats: [
    { value: "waffle", label: "Slat grid", icon: <WaffleIcon /> },
    { value: "grid2", label: "Grid", icon: <Grid2x2 /> },
    { value: "crosshair", label: "Crosshair", icon: <Crosshair /> },
  ],
} satisfies Record<PaneIconRole, PaneIconOption[]>;

export function VegetationBabylonPreview({ asset, grass, mode, focusPhraseId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  const [closeupView, setCloseupView] = useState<CloseupViewMode>("head");
  const [closeupZoom, setCloseupZoom] = useState(1);
  const [paneIcons, setPaneIcons] = useState<Record<PaneIconRole, string>>(defaultPaneIcons);
  const visualSignature = useMemo(() => getPreviewVisualSignature(asset, grass, mode), [asset, grass, mode]);
  const closeupIconRole: PaneIconRole = closeupView === "head" ? "head" : "side";
  const setPaneIcon = (role: PaneIconRole, value: string) => setPaneIcons((current) => ({ ...current, [role]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new Engine(canvas, true, { antialias: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.88, 0.93, 0.86, 1);

    const key = new HemisphericLight("assetLight", new Vector3(-0.45, 1, 0.25), scene);
    key.intensity = 0.9;

    runtimeRef.current = { engine, scene, roots: [], cameras: [] };

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      runtimeRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const runtime = runtimeRef.current;
    if (!canvas || !runtime) return;
    rebuildPreview(runtime, canvas, asset, grass, mode, focusPhraseId, closeupView, closeupZoom);
  }, [visualSignature, closeupView, closeupZoom]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    updateCameraTargets(runtime.cameras, asset, mode, focusPhraseId, closeupView, closeupZoom);
  }, [asset, mode, focusPhraseId, closeupView, closeupZoom]);

  if (mode) return <canvas ref={canvasRef} data-testid={`vegetation-preview-${mode}`} className="h-full min-h-0 w-full touch-none rounded-md bg-[#dfead8]" />;

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-md bg-[#dfead8]">
      <canvas ref={canvasRef} data-testid="vegetation-preview-board" className="h-full min-h-0 w-full touch-none" />
      <PreviewPaneChrome
        className="left-2 top-2"
        icon={renderPaneIcon(closeupIconRole, paneIcons[closeupIconRole])}
        iconOptions={paneIconOptions[closeupIconRole]}
        iconValue={paneIcons[closeupIconRole]}
        label={previewLabels.flowerCloseup}
        onIconChange={(icon) => setPaneIcon(closeupIconRole, icon)}
      >
        <MenuLabel>Closeup View</MenuLabel>
        <MenuItem onSelect={() => setCloseupView("head")}>Head / crown view</MenuItem>
        <MenuItem onSelect={() => setCloseupView("side")}>Side profile view</MenuItem>
        <MenuSeparator />
        <MenuLabel>Zoom</MenuLabel>
        <MenuItem onSelect={() => setCloseupZoom(0.82)}>Wide</MenuItem>
        <MenuItem onSelect={() => setCloseupZoom(1)}>Fit</MenuItem>
        <MenuItem onSelect={() => setCloseupZoom(1.28)}>Close</MenuItem>
      </PreviewPaneChrome>
      <PreviewPaneChrome className="left-2 top-[43%]" icon={renderPaneIcon("density", paneIcons.density)} iconOptions={paneIconOptions.density} iconValue={paneIcons.density} label={previewLabels.population50} onIconChange={(icon) => setPaneIcon("density", icon)}>
        <MenuLabel>Density Preview</MenuLabel>
        <MenuItem disabled>500 instances</MenuItem>
        <MenuItem disabled>Authored density 50%</MenuItem>
      </PreviewPaneChrome>
      <PreviewPaneChrome className="left-[calc(50%+0.5rem)] top-[43%]" icon={renderPaneIcon("density", paneIcons.density)} iconOptions={paneIconOptions.density} iconValue={paneIcons.density} label={previewLabels.population100} onIconChange={(icon) => setPaneIcon("density", icon)}>
        <MenuLabel>Density Preview</MenuLabel>
        <MenuItem disabled>1000 instances</MenuItem>
        <MenuItem disabled>Authored density 100%</MenuItem>
      </PreviewPaneChrome>
      <PreviewPaneChrome className="left-2 top-[72%]" icon={renderPaneIcon("slats", paneIcons.slats)} iconOptions={paneIconOptions.slats} iconValue={paneIcons.slats} label={previewLabels.slats50} onIconChange={(icon) => setPaneIcon("slats", icon)}>
        <MenuLabel>LOD Slats</MenuLabel>
        <MenuItem disabled>50% grass / 50% vegetation</MenuItem>
        <MenuItem disabled>Waffle slat layout</MenuItem>
      </PreviewPaneChrome>
      <PreviewPaneChrome className="left-[calc(50%+0.5rem)] top-[72%]" icon={renderPaneIcon("slats", paneIcons.slats)} iconOptions={paneIconOptions.slats} iconValue={paneIcons.slats} label={previewLabels.slats100} onIconChange={(icon) => setPaneIcon("slats", icon)}>
        <MenuLabel>LOD Slats</MenuLabel>
        <MenuItem disabled>100% vegetation</MenuItem>
        <MenuItem disabled>Waffle slat layout</MenuItem>
      </PreviewPaneChrome>
    </div>
  );
}

function rebuildPreview(runtime: PreviewRuntime, canvas: HTMLCanvasElement, asset: VegetationSpeciesAssetFile, grass: GrassLodSettings, mode?: PreviewMode, focusPhraseId?: string, closeupView: CloseupViewMode = "head", closeupZoom = 1) {
  const cameraState = new Map(runtime.cameras.map((camera) => [camera.name, { alpha: camera.alpha, beta: camera.beta, radius: camera.radius }]));
  const oldRoots = runtime.roots;

  if (!mode && asset.species.parts[0].shape.type === "fieldFlower") {
    updateFieldFlowerBoard(runtime, canvas, asset, grass, focusPhraseId, cameraState, closeupView, closeupZoom);
    return;
  }

  disposeFieldFlowerBoard(runtime);

  if (mode) {
    if (runtime.cameras.length !== 1 || runtime.cameras[0].name !== "assetCamera") {
      for (const camera of runtime.cameras) camera.dispose();
      runtime.cameras = [];
    }
    const cameraTarget = getCameraTarget(asset, mode, focusPhraseId);
    const cameraRadius = mode === "flowerCloseup" ? getCloseupCameraRadius(closeupZoom) : 7.8;
    const camera = runtime.cameras[0] ?? new ArcRotateCamera("assetCamera", closeupView === "side" ? -Math.PI / 2 : -Math.PI / 2.45, mode === "flowerCloseup" && closeupView === "side" ? Math.PI / 2.05 : mode === "flowerCloseup" ? Math.PI / 2.35 : Math.PI / 3.1, cameraRadius, cameraTarget, runtime.scene);
    if (!runtime.cameras[0]) {
      camera.attachControl(canvas, true);
      camera.lowerRadiusLimit = 0.7;
      camera.upperRadiusLimit = 11;
      camera.wheelPrecision = 42;
      restoreCameraState(camera, cameraState);
      runtime.cameras = [camera];
    }
    if (mode === "flowerCloseup") applyCloseupCameraView(camera, closeupView, closeupZoom);
    camera.setTarget(cameraTarget);
    const root = new TransformNode("vegetationAssetPreview", runtime.scene);
    buildPreviewScene(runtime.scene, root, asset, grass, mode);
    runtime.scene.activeCamera = camera;
    runtime.scene.activeCameras = null;
    runtime.roots = [root];
    for (const oldRoot of oldRoots) oldRoot.dispose(false, true);
    return;
  }

  if (!runtime.cameras.every((camera) => previewModes.some((item) => camera.name === `${item}-camera`))) {
    for (const camera of runtime.cameras) camera.dispose();
    runtime.cameras = [];
    runtime.scene.activeCameras = null;
  }
  const cameras = ensureBoardCameras(runtime.scene, canvas, asset, focusPhraseId, cameraState, closeupView, closeupZoom);
  const roots = buildPreviewBoard(runtime.scene, asset, grass);
  runtime.roots = roots;
  runtime.cameras = cameras;
  runtime.scene.activeCameras = cameras;
  for (const oldRoot of oldRoots) oldRoot.dispose(false, true);
}

function updateFieldFlowerBoard(
  runtime: PreviewRuntime,
  canvas: HTMLCanvasElement,
  asset: VegetationSpeciesAssetFile,
  grass: GrassLodSettings,
  focusPhraseId: string | undefined,
  cameraState: Map<string, { alpha: number; beta: number; radius: number }>,
  closeupView: CloseupViewMode,
  closeupZoom: number,
) {
  const sourceShape = asset.species.parts[0].shape;
  if (sourceShape.type !== "fieldFlower") return;
  const preview = getRenderableFlowerPreview(asset);
  const initialShape = preview?.shape ?? sourceShape;

  if (!runtime.fieldBoard) {
    for (const oldRoot of runtime.roots) oldRoot.dispose(false, true);
    for (const camera of runtime.cameras) camera.dispose();
    runtime.roots = [];
    runtime.cameras = [];
    runtime.scene.activeCameras = null;

    const cameras = ensureBoardCameras(runtime.scene, canvas, asset, focusPhraseId, cameraState, closeupView, closeupZoom);
    const roots = Object.fromEntries(previewModes.map((item) => {
      const root = new TransformNode(`${item}-field-live-root`, runtime.scene);
      const groundSize = item === "flowerCloseup" ? 2.2 : 8.5;
      const ground = MeshBuilder.CreateGround(`${item}-field-ground`, { width: groundSize, height: groundSize }, runtime.scene);
      ground.material = material(runtime.scene, `${item}-field-ground-mat`, "#d4e0c4");
      ground.parent = root;
      return [item, root];
    })) as Record<PreviewMode, TransformNode>;

    const fieldBoard: FieldFlowerBoardHandle = {
      roots,
      cameras,
      closeup: createFieldFlowerCloseup(runtime.scene, roots.flowerCloseup, initialShape),
      population50: createFieldFlowerPopulation(runtime.scene, roots.population50, "population50"),
      population100: createFieldFlowerPopulation(runtime.scene, roots.population100, "population100"),
      slats50: createFieldFlowerSlatPreview(runtime.scene, roots.slats50, grass),
      slats100: createFieldFlowerSlatPreview(runtime.scene, roots.slats100, grass),
    };

    for (const item of previewModes) setLayerMask(roots[item], previewMasks[item]);
    runtime.fieldBoard = fieldBoard;
    runtime.roots = previewModes.map((item) => roots[item]);
    runtime.cameras = cameras;
    runtime.scene.activeCameras = cameras;
  }

  const fieldBoard = runtime.fieldBoard!;
  const petalMaterialId = getPetalMaterialId(asset);
  const petalColor = asset.species.materials[petalMaterialId]?.baseColor ?? "#a8c7fa";
  const leafColor = preview?.leaf ? asset.species.materials[preview.leaf.materialId]?.baseColor ?? "#4c9a4b" : "#4c9a4b";

  updateFieldFlowerCloseup(fieldBoard.closeup, preview, petalColor, leafColor);
  updateFieldFlowerPopulation(fieldBoard.population50, preview, petalColor, leafColor, 0.5, 500);
  updateFieldFlowerPopulation(fieldBoard.population100, preview, petalColor, leafColor, 1, 1000);
  updateFieldFlowerSlatPreview(fieldBoard.slats50, preview, petalColor, { ...grass, density: 0.5 }, 90);
  updateFieldFlowerSlatPreview(fieldBoard.slats100, preview, petalColor, { ...grass, density: 1 }, 170);
  updateCameraTargets(fieldBoard.cameras, asset, undefined, focusPhraseId, closeupView, closeupZoom);
  runtime.scene.activeCameras = fieldBoard.cameras;
}

function disposeFieldFlowerBoard(runtime: PreviewRuntime) {
  if (!runtime.fieldBoard) return;
  runtime.fieldBoard = undefined;
}

const maxCloseupPetals = 36;
const maxCloseupLeaves = 16;
const maxSlatMarkers = 180;

function createFieldFlowerCloseup(scene: Scene, parent: TransformNode, initialShape: FieldFlowerShapeDefinition): FieldFlowerCloseupHandle {
  const root = new TransformNode("field-live-closeup", scene);
  root.position.set(0, 0, -0.08);
  root.scaling.setAll(3.2);
  root.parent = parent;

  const stemMaterial = material(scene, "field-live-closeup-stem-mat", "#486d2f");
  const centerMaterial = material(scene, "field-live-closeup-center-mat", "#f0c75e");
  const petalMaterial = material(scene, "field-live-closeup-petal-mat", "#a8c7fa");
  const leafMaterial = material(scene, "field-live-closeup-leaf-mat", "#4c9a4b");
  petalMaterial.backFaceCulling = false;
  leafMaterial.backFaceCulling = false;

  const stem = MeshBuilder.CreateCylinder("field-live-closeup-stem", { height: 1, diameter: 1, tessellation: 6 }, scene);
  stem.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  stem.material = stemMaterial;
  stem.parent = root;

  const center = MeshBuilder.CreateSphere("field-live-closeup-center", { diameter: 1, segments: 10 }, scene);
  center.material = centerMaterial;
  center.parent = root;

  const petalSource = new Mesh("field-live-closeup-petal-source", scene);
  petalSource.material = petalMaterial;
  petalSource.parent = root;
  applySaddlePetalGeometry(petalSource, initialShape);
  petalSource.setEnabled(false);

  const petals = Array.from({ length: maxCloseupPetals }, (_, index) => {
    const petal = petalSource.clone(`field-live-closeup-petal-${index}`)!;
    petal.parent = root;
    petal.setEnabled(false);
    return petal;
  });

  const leafSource = MeshBuilder.CreatePlane("field-live-closeup-leaf-source", { width: 1, height: 1 }, scene);
  leafSource.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  leafSource.material = leafMaterial;
  leafSource.parent = root;
  leafSource.setEnabled(false);

  const leaves = Array.from({ length: maxCloseupLeaves }, (_, index) => {
    const leaf = leafSource.clone(`field-live-closeup-leaf-${index}`)!;
    leaf.parent = root;
    leaf.setEnabled(false);
    return leaf;
  });

  return { root, stem, center, petalSource, petals, leafSource, leaves, stemMaterial, centerMaterial, petalMaterial, leafMaterial };
}

function updateFieldFlowerCloseup(handle: FieldFlowerCloseupHandle, preview: RecipeFlowerPreview | undefined, petalColor: string, leafColor: string) {
  handle.root.setEnabled(Boolean(preview));
  if (!preview) return;

  const shape = preview.shape;
  const petalCount = preview.hasPetals ? Math.max(1, Math.min(maxCloseupPetals, Math.round(midpoint(shape.petalCount)))) : 0;
  const petalLength = midpoint(shape.petalLength);
  const petalWidth = midpoint(shape.petalWidth);
  const stemHeight = midpoint(shape.stemHeight);
  const stemRadius = midpoint(shape.stemRadius);
  const centerRadius = midpoint(shape.centerRadius);
  const stemVector = stemGrowthVector(stemHeight, preview.stemArcDegrees, preview.stemArcAzimuthDegrees);

  setMaterialColor(handle.petalMaterial, petalColor);
  setMaterialColor(handle.leafMaterial, leafColor);
  setMaterialColor(handle.stemMaterial, "#486d2f");
  setMaterialColor(handle.centerMaterial, "#f0c75e");
  applySaddlePetalGeometry(handle.petalSource, shape);

  handle.stem.setEnabled(preview.hasStem);
  handle.stem.scaling.set(stemRadius, stemHeight, stemRadius);
  orientAlongVector(handle.stem, stemVector);
  handle.center.setEnabled(preview.hasCenter);
  handle.center.scaling.set(centerRadius, centerRadius * 0.62, centerRadius);
  handle.center.position.copyFrom(stemVector);

  for (let index = 0; index < handle.petals.length; index += 1) {
    const petal = handle.petals[index];
    const enabled = index < petalCount;
    petal.setEnabled(enabled);
    if (!enabled) continue;
    const theta = (index / petalCount) * Math.PI * 2;
    petal.scaling.set(petalWidth, petalLength, petalLength);
    petal.position.set(stemVector.x, stemVector.y, stemVector.z + (centerRadius * 0.55));
    petal.rotation.set(-0.72, theta, 0);
  }

  const leaf = preview.leaf;
  const leafCount = leaf ? Math.max(1, Math.min(maxCloseupLeaves, Math.round(leaf.count))) : 0;
  for (let index = 0; index < handle.leaves.length; index += 1) {
    const leafMesh = handle.leaves[index];
    const enabled = index < leafCount;
    leafMesh.setEnabled(enabled);
    if (!enabled || !leaf) continue;
    const theta = branchTheta(leaf, index, leafCount);
    const y = branchStemPosition(leaf, index, leafCount, stemHeight);
    const t = stemHeight > 0 ? y / stemHeight : 0;
    leafMesh.position.set(stemVector.x * t, stemVector.y * t, stemVector.z * t);
    leafMesh.scaling.set(leaf.width, leaf.length, 1);
    leafMesh.rotation.set(0, theta, -degreesToRadians(leaf.deviationDegrees));
  }
}

function createFieldFlowerPopulation(scene: Scene, parent: TransformNode, name: string): FieldFlowerPopulationHandle {
  const stemMaterial = material(scene, `${name}-live-stem-mat`, "#486d2f");
  const centerMaterial = material(scene, `${name}-live-center-mat`, "#f0c75e");
  const petalMaterial = material(scene, `${name}-live-petal-mat`, "#a8c7fa");
  const leafMaterial = material(scene, `${name}-live-leaf-mat`, "#4c9a4b");
  petalMaterial.backFaceCulling = false;
  leafMaterial.backFaceCulling = false;

  const stem = MeshBuilder.CreateCylinder(`${name}-live-stem-source`, { height: 1, diameter: 1, tessellation: 5 }, scene);
  stem.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  stem.material = stemMaterial;
  stem.parent = parent;

  const center = MeshBuilder.CreateSphere(`${name}-live-center-source`, { diameter: 1, segments: 6 }, scene);
  center.material = centerMaterial;
  center.parent = parent;

  const petal = new Mesh(`${name}-live-petal-source`, scene);
  petal.material = petalMaterial;
  petal.parent = parent;

  const leaf = MeshBuilder.CreatePlane(`${name}-live-leaf-source`, { width: 1, height: 1 }, scene);
  leaf.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  leaf.material = leafMaterial;
  leaf.parent = parent;

  return { stem, center, petal, leaf, stemMaterial, centerMaterial, petalMaterial, leafMaterial };
}

function updateFieldFlowerPopulation(handle: FieldFlowerPopulationHandle, preview: RecipeFlowerPreview | undefined, petalColor: string, leafColor: string, density: number, count: number) {
  handle.stem.setEnabled(Boolean(preview?.hasStem));
  handle.center.setEnabled(Boolean(preview?.hasCenter));
  handle.petal.setEnabled(Boolean(preview?.hasPetals));
  handle.leaf.setEnabled(Boolean(preview?.leaf));
  if (!preview) return;

  const shape = preview.shape;
  const radius = 3.65;
  const plantScale = density === 1 ? 0.66 : 0.72;
  const petalCount = Math.max(1, Math.round(midpoint(shape.petalCount)));
  const petalLength = midpoint(shape.petalLength) * plantScale;
  const petalWidth = midpoint(shape.petalWidth) * plantScale;
  const stemHeight = midpoint(shape.stemHeight) * plantScale;
  const stemRadius = midpoint(shape.stemRadius) * plantScale;
  const centerRadius = midpoint(shape.centerRadius) * plantScale;
  const stemVector = stemGrowthVector(stemHeight, preview.stemArcDegrees, preview.stemArcAzimuthDegrees);

  setMaterialColor(handle.petalMaterial, petalColor);
  setMaterialColor(handle.leafMaterial, leafColor);
  setMaterialColor(handle.stemMaterial, "#486d2f");
  setMaterialColor(handle.centerMaterial, "#f0c75e");
  applySaddlePetalGeometry(handle.petal, shape);

  const stemMatrices = new Float32Array(preview.hasStem ? count * 16 : 0);
  const centerMatrices = new Float32Array(preview.hasCenter ? count * 16 : 0);
  const petalMatrices = new Float32Array(preview.hasPetals ? count * petalCount * 16 : 0);
  const leafCount = preview.leaf ? Math.max(1, Math.min(maxCloseupLeaves, Math.round(preview.leaf.count))) : 0;
  const leafMatrices = new Float32Array(preview.leaf ? count * leafCount * 16 : 0);
  let petalCursor = 0;
  let leafCursor = 0;

  for (let index = 0; index < count; index += 1) {
    const angle = hash(index, 31) * Math.PI * 2;
    const distance = Math.sqrt(hash(index, 32)) * radius;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const yaw = hash(index, 33) * Math.PI * 2;
    const scale = 0.75 + (hash(index, 34) * 0.5);
    const world = Matrix.Translation(x, 0, z);
    const facing = Matrix.RotationY(yaw);
    const headLift = Matrix.Translation(stemVector.x * scale, stemVector.y * scale, stemVector.z * scale);

    if (preview.hasStem) {
      Matrix.Scaling(stemRadius * scale, stemHeight * scale, stemRadius * scale)
        .multiply(stemOrientationMatrix(stemVector))
        .multiply(world)
        .copyToArray(stemMatrices, index * 16);
    }

    if (preview.hasCenter) {
      Matrix.Scaling(centerRadius * scale, centerRadius * 0.62 * scale, centerRadius * scale)
        .multiply(headLift)
        .multiply(facing)
        .multiply(world)
        .copyToArray(centerMatrices, index * 16);
    }

    for (let petalIndex = 0; preview.hasPetals && petalIndex < petalCount; petalIndex += 1) {
      const theta = ((petalIndex / petalCount) * Math.PI * 2) + ((hash(index + petalIndex, 35) - 0.5) * 0.16);
      Matrix.Scaling(petalWidth * scale, petalLength * scale, petalLength * scale)
        .multiply(Matrix.Translation(0, 0, centerRadius * 0.55 * scale))
        .multiply(Matrix.RotationX(-0.72))
        .multiply(Matrix.RotationY(theta))
        .multiply(headLift)
        .multiply(facing)
        .multiply(world)
        .copyToArray(petalMatrices, petalCursor * 16);
      petalCursor += 1;
    }

    for (let leafIndex = 0; preview.leaf && leafIndex < leafCount; leafIndex += 1) {
      const theta = branchTheta(preview.leaf, leafIndex, leafCount) + yaw;
      const leafY = branchStemPosition(preview.leaf, leafIndex, leafCount, stemHeight) * scale;
      const t = stemHeight > 0 ? leafY / (stemHeight * scale) : 0;
      const stemPoint = rotateYVector(stemVector.x * scale * t, stemVector.y * scale * t, stemVector.z * scale * t, yaw);
      Matrix.Scaling(preview.leaf.width * plantScale * scale, preview.leaf.length * plantScale * scale, 1)
        .multiply(Matrix.RotationZ(-degreesToRadians(preview.leaf.deviationDegrees)))
        .multiply(Matrix.RotationY(theta))
        .multiply(Matrix.Translation(x + stemPoint.x, stemPoint.y, z + stemPoint.z))
        .copyToArray(leafMatrices, leafCursor * 16);
      leafCursor += 1;
    }
  }

  if (preview.hasStem) {
    handle.stem.thinInstanceSetBuffer("matrix", stemMatrices, 16);
    handle.stem.thinInstanceRefreshBoundingInfo();
  }
  if (preview.hasCenter) {
    handle.center.thinInstanceSetBuffer("matrix", centerMatrices, 16);
    handle.center.thinInstanceRefreshBoundingInfo();
  }
  if (preview.hasPetals) {
    handle.petal.thinInstanceSetBuffer("matrix", petalMatrices, 16);
    handle.petal.thinInstanceRefreshBoundingInfo();
  }
  if (preview.leaf) {
    handle.leaf.thinInstanceSetBuffer("matrix", leafMatrices, 16);
    handle.leaf.thinInstanceRefreshBoundingInfo();
  }
}

function createFieldFlowerSlatPreview(scene: Scene, parent: TransformNode, grass: GrassLodSettings): FieldFlowerSlatHandle {
  const markerMaterial = material(scene, "field-live-slat-marker-mat", "#a8c7fa");
  const markers = Array.from({ length: maxSlatMarkers }, (_, index) => {
    const marker = MeshBuilder.CreateSphere(`field-live-slat-marker-${index}`, { diameter: 0.045 + (hash(index, 43) * 0.035), segments: 5 }, scene);
    marker.material = markerMaterial;
    marker.parent = parent;
    marker.setEnabled(false);
    return marker;
  });
  const slatMesh = new Mesh("field-live-slat-waffle", scene);
  slatMesh.parent = parent;
  slatMesh.isPickable = false;
  slatMesh.material = slatMaterial(scene, grass);
  return { markers, markerMaterial, slatMesh, slatMaterial: slatMesh.material instanceof ShaderMaterial ? slatMesh.material : undefined };
}

function updateFieldFlowerSlatPreview(handle: FieldFlowerSlatHandle, preview: RecipeFlowerPreview | undefined, petalColor: string, grass: GrassLodSettings, count: number) {
  setMaterialColor(handle.markerMaterial, petalColor);
  const showMarkers = Boolean(preview?.hasPetals || preview?.hasCenter);
  for (let index = 0; index < handle.markers.length; index += 1) {
    const marker = handle.markers[index];
    const enabled = showMarkers && index < count;
    marker.setEnabled(enabled);
    if (!enabled) continue;
    const angle = hash(index, 41) * Math.PI * 2;
    const distance = Math.sqrt(hash(index, 42)) * 3.75;
    marker.position.set(Math.cos(angle) * distance, 0.07, Math.sin(angle) * distance);
  }

  applySlatWaffleGeometry(handle.slatMesh, 0, 0, grass);
  if (handle.slatMaterial) updateSlatMaterial(handle.slatMaterial, grass);
  else {
    const nextMaterial = slatMaterial(handle.slatMesh.getScene(), grass);
    handle.slatMesh.material = nextMaterial;
    handle.slatMaterial = nextMaterial;
  }
}

function stemGrowthVector(height: number, arcDegrees: number, arcAzimuthDegrees: number) {
  const arc = degreesToRadians(Math.max(0, Math.min(180, arcDegrees)));
  const azimuth = degreesToRadians(arcAzimuthDegrees);
  const radial = Math.sin(arc) * height;
  return new Vector3(Math.cos(azimuth) * radial, Math.cos(arc) * height, Math.sin(azimuth) * radial);
}

function stemOrientationMatrix(vector: Vector3) {
  const direction = vector.lengthSquared() > 0.000001 ? vector.normalizeToNew() : new Vector3(0, 1, 0);
  const rotation = new Quaternion();
  Quaternion.FromUnitVectorsToRef(new Vector3(0, 1, 0), direction, rotation);
  const matrix = Matrix.Identity();
  Matrix.FromQuaternionToRef(rotation, matrix);
  return matrix;
}

function orientAlongVector(mesh: Mesh, vector: Vector3) {
  const direction = vector.lengthSquared() > 0.000001 ? vector.normalizeToNew() : new Vector3(0, 1, 0);
  mesh.rotationQuaternion ??= new Quaternion();
  Quaternion.FromUnitVectorsToRef(new Vector3(0, 1, 0), direction, mesh.rotationQuaternion);
}

function rotateYVector(x: number, y: number, z: number, yaw: number) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return new Vector3((x * cos) + (z * sin), y, (z * cos) - (x * sin));
}

function branchTheta(leaf: RecipeLeafPreview, index: number, count: number) {
  const base = degreesToRadians(leaf.aroundAxisDegrees);
  if (leaf.layout === "alongPath") return base + ((index % 2) * Math.PI);
  if (leaf.layout === "alternating") return base + (index * Math.PI);
  if (leaf.layout === "radial") return base + ((index / Math.max(1, count)) * Math.PI * 2);
  return base;
}

function branchStemPosition(leaf: RecipeLeafPreview, index: number, count: number, stemHeight: number) {
  if (leaf.layout === "tip") return stemHeight;
  if (leaf.layout === "alongPath" || leaf.layout === "alternating") {
    const t = (index + 1) / (count + 1);
    return stemHeight * (0.18 + (t * 0.62));
  }
  return stemHeight * 0.82;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function setMaterialColor(mat: StandardMaterial, color: string) {
  const next = Color3.FromHexString(color);
  mat.diffuseColor.copyFrom(next);
}

function restoreCameraState(camera: ArcRotateCamera, state: Map<string, { alpha: number; beta: number; radius: number }>) {
  const previous = state.get(camera.name);
  if (!previous) return;
  camera.alpha = previous.alpha;
  camera.beta = previous.beta;
  camera.radius = previous.radius;
}

function getCloseupCameraRadius(closeupZoom: number) {
  return 2.1 / Math.max(0.55, closeupZoom);
}

function applyCloseupCameraView(camera: ArcRotateCamera, closeupView: CloseupViewMode, closeupZoom: number) {
  camera.alpha = closeupView === "side" ? -Math.PI / 2 : -Math.PI / 2.45;
  camera.beta = closeupView === "side" ? Math.PI / 2.05 : Math.PI / 2.35;
  camera.radius = getCloseupCameraRadius(closeupZoom);
}

function updateCameraTargets(cameras: ArcRotateCamera[], asset: VegetationSpeciesAssetFile, mode?: PreviewMode, focusPhraseId?: string, closeupView: CloseupViewMode = "head", closeupZoom = 1) {
  if (mode) {
    if (cameras[0] && mode === "flowerCloseup") applyCloseupCameraView(cameras[0], closeupView, closeupZoom);
    cameras[0]?.setTarget(getCameraTarget(asset, mode, focusPhraseId));
    return;
  }
  for (const item of previewModes) {
    const camera = cameras.find((candidate) => candidate.name === `${item}-camera`);
    if (camera && item === "flowerCloseup") applyCloseupCameraView(camera, closeupView, closeupZoom);
    camera?.setTarget(getCameraTarget(asset, item, focusPhraseId));
  }
}

function renderPaneIcon(role: PaneIconRole, value: string) {
  if (role === "head") {
    if (value === "flower") return <Flower />;
    if (value === "asterisk") return <Asterisk />;
    if (value === "circle") return <CircleDot />;
    return <Flower2 />;
  }
  if (role === "side") {
    if (value === "profile") return <GalleryHorizontal />;
    if (value === "leaf") return <Leaf />;
    return <PanelRight />;
  }
  if (role === "density") {
    if (value === "grid3") return <Grid3x3 />;
    if (value === "layout") return <LayoutGrid />;
    if (value === "circle") return <CircleDot />;
    return <QuincunxIcon />;
  }
  if (value === "waffle") return <WaffleIcon />;
  if (value === "grid2") return <Grid2x2 />;
  if (value === "crosshair") return <Crosshair />;
  return <WaffleIcon />;
}

function PreviewPaneChrome({
  children,
  className,
  icon,
  iconOptions,
  iconValue,
  label,
  onIconChange,
}: {
  children: ReactNode;
  className: string;
  icon: ReactNode;
  iconOptions: PaneIconOption[];
  iconValue: string;
  label: string;
  onIconChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const paneButtonBase = "group relative grid h-7 w-7 place-items-center rounded-md border-[0.5px] outline-none backdrop-blur-[1px] transition focus-visible:border-[#2f6f34] focus-visible:shadow-[0_0_0_2px_rgb(47_111_52_/_15%)] [&_svg]:h-3.5 [&_svg]:w-3.5";
  const paneButtonTone = open
    ? "border-[color-mix(in_srgb,var(--app-text)_45%,transparent)] bg-[var(--surface-bg)] text-[var(--app-text)] shadow-[0_4px_12px_rgb(31_49_27_/_12%)] [&_svg]:stroke-[2]"
    : "border-[color-mix(in_srgb,var(--app-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--surface-bg)_8%,transparent)] text-[color-mix(in_srgb,var(--app-text)_62%,transparent)] hover:border-[color-mix(in_srgb,var(--app-text)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface-bg)_48%,transparent)] hover:text-[color-mix(in_srgb,var(--app-text)_86%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--surface-bg)_72%,transparent)] focus-visible:text-[var(--app-text)] [&_svg]:stroke-[1.75]";
  return (
    <div className={`absolute ${className}`}>
      <Menu
        open={open}
        onOpenChange={setOpen}
        trigger={(
          <button
            aria-label={`${label} options`}
            className={`${paneButtonBase} ${paneButtonTone}`}
            type="button"
          >
            {icon}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-full z-30 mt-1 max-w-56 origin-top-left scale-95 truncate rounded-md border border-[color-mix(in_srgb,var(--app-text)_22%,transparent)] bg-[color-mix(in_srgb,var(--surface-bg)_94%,transparent)] px-2 py-1 text-xs font-bold text-[var(--app-text)] opacity-0 shadow-[0_8px_18px_rgb(31_49_27_/_14%)] transition group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
            >
              {label}
            </span>
          </button>
        )}
      >
        {children}
        <MenuSeparator />
        <MenuLabel>Icon</MenuLabel>
        {iconOptions.map((option) => (
          <MenuItem key={option.value} onSelect={() => onIconChange(option.value)}>
            <span className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2">
              <span className="[&_svg]:h-4 [&_svg]:w-4">{option.icon}</span>
              <span>{option.label}</span>
              <span className="text-xs text-[var(--muted-text)]">{option.value === iconValue ? "Current" : ""}</span>
            </span>
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

function WaffleIcon() {
  return (
    <span className="relative block h-4 w-4" aria-hidden="true">
      <span className="absolute left-[3px] top-0 h-full w-px rounded-full bg-current" />
      <span className="absolute right-[3px] top-0 h-full w-px rounded-full bg-current" />
      <span className="absolute left-0 top-[3px] h-px w-full rounded-full bg-current" />
      <span className="absolute bottom-[3px] left-0 h-px w-full rounded-full bg-current" />
    </span>
  );
}

function QuincunxIcon() {
  return (
    <span className="grid h-4 w-4 grid-cols-3 grid-rows-3 gap-px" aria-hidden="true">
      {[0, 2, 4, 6, 8].map((index) => (
        <span key={index} className="h-1.5 w-1.5 self-center justify-self-center rounded-full bg-current" style={{ gridColumnStart: (index % 3) + 1, gridRowStart: Math.floor(index / 3) + 1 }} />
      ))}
    </span>
  );
}

function ensureBoardCameras(scene: Scene, canvas: HTMLCanvasElement, asset: VegetationSpeciesAssetFile, focusPhraseId: string | undefined, cameraState: Map<string, { alpha: number; beta: number; radius: number }>, closeupView: CloseupViewMode, closeupZoom: number) {
  const viewports = {
    flowerCloseup: new Viewport(0, 0.58, 1, 0.42),
    population50: new Viewport(0, 0.29, 0.5, 0.29),
    population100: new Viewport(0.5, 0.29, 0.5, 0.29),
    slats50: new Viewport(0, 0, 0.5, 0.29),
    slats100: new Viewport(0.5, 0, 0.5, 0.29),
  } satisfies Record<PreviewMode, Viewport>;

  const cameras: ArcRotateCamera[] = scene.activeCameras?.length === previewModes.length
    ? scene.activeCameras.filter((camera): camera is ArcRotateCamera => camera instanceof ArcRotateCamera)
    : [];
  if (cameras.length !== previewModes.length) {
    for (const camera of scene.activeCameras ?? []) camera.dispose();
    cameras.length = 0;
  }
  for (const item of previewModes) {
    const existing = cameras.find((camera) => camera.name === `${item}-camera`);
    const cameraTarget = getCameraTarget(asset, item, focusPhraseId);
    const cameraRadius = item === "flowerCloseup" ? getCloseupCameraRadius(closeupZoom) : 7.8;
    const camera = existing ?? new ArcRotateCamera(`${item}-camera`, closeupView === "side" && item === "flowerCloseup" ? -Math.PI / 2 : -Math.PI / 2.45, item === "flowerCloseup" && closeupView === "side" ? Math.PI / 2.05 : item === "flowerCloseup" ? Math.PI / 2.35 : Math.PI / 3.1, cameraRadius, cameraTarget, scene);
    camera.viewport = viewports[item];
    camera.layerMask = previewMasks[item];
    camera.setTarget(cameraTarget);
    if (!existing) restoreCameraState(camera, cameraState);
    if (item === "flowerCloseup") applyCloseupCameraView(camera, closeupView, closeupZoom);
    if (!existing && item === "flowerCloseup") {
      camera.attachControl(canvas, true);
      camera.lowerRadiusLimit = 0.7;
      camera.upperRadiusLimit = 5.4;
      camera.wheelPrecision = 42;
    }
    if (!existing) cameras.push(camera);
  }
  return previewModes.map((item) => cameras.find((camera) => camera.name === `${item}-camera`)!);
}

function buildPreviewBoard(scene: Scene, asset: VegetationSpeciesAssetFile, grass: GrassLodSettings) {
  const roots: TransformNode[] = [];
  for (const item of previewModes) {
    const root = new TransformNode(`${item}-root`, scene);
    buildPreviewScene(scene, root, asset, grass, item);
    setLayerMask(root, previewMasks[item]);
    roots.push(root);
  }
  return roots;
}

function setLayerMask(root: TransformNode, mask: number) {
  for (const mesh of root.getChildMeshes(false)) {
    mesh.layerMask = mask;
  }
}

function buildPreviewScene(scene: Scene, root: TransformNode, asset: VegetationSpeciesAssetFile, grass: GrassLodSettings, mode: PreviewMode) {
  const groundMat = material(scene, "previewGround", "#d4e0c4");
  const groundSize = mode === "flowerCloseup" ? 2.2 : 8.5;
  const ground = MeshBuilder.CreateGround("preview-ground", { width: groundSize, height: groundSize }, scene);
  ground.material = groundMat;
  ground.parent = root;

  const sourceShape = asset.species.parts[0].shape;
  const flowerPreview = getRenderableFlowerPreview(asset);
  const petalMaterialId = getPetalMaterialId(asset);
  const primaryMaterialId = asset.species.parts[0].materialId;
  const petalColor = asset.species.materials[petalMaterialId]?.baseColor ?? "#a8c7fa";
  const primaryColor = asset.species.materials[primaryMaterialId]?.baseColor ?? petalColor;
  if (sourceShape.type === "cloverCluster") {
    if (mode === "flowerCloseup") {
      const cloverRoot = new TransformNode("clover-closeup", scene);
      cloverRoot.position.set(0, 0, -0.08);
      cloverRoot.scaling.setAll(4.5);
      cloverRoot.parent = root;
      buildCloverCluster(scene, cloverRoot, sourceShape, primaryColor);
      return;
    }
    if (mode === "population50" || mode === "population100") {
      buildCloverPopulation(scene, root, sourceShape, primaryColor, mode === "population50" ? 320 : 640);
      return;
    }
    const density = mode === "slats50" ? 0.5 : 1;
    buildSparseVegetationMarkers(scene, root, primaryColor, density, mode === "slats50" ? 100 : 180);
    buildSlatWaffle(scene, root, 0, 0, { ...grass, density });
    return;
  }
  if (sourceShape.type === "tallFlower") {
    const stemColor = asset.species.materials.stem?.baseColor ?? "#3f7f3d";
    if (mode === "flowerCloseup") {
      const tallRoot = new TransformNode("tall-flower-closeup", scene);
      tallRoot.position.set(0, 0, -0.08);
      tallRoot.scaling.setAll(2.5);
      tallRoot.parent = root;
      buildTallFlower(scene, tallRoot, sourceShape, primaryColor, stemColor);
      return;
    }
    if (mode === "population50" || mode === "population100") {
      buildTallFlowerPopulation(scene, root, sourceShape, primaryColor, stemColor, mode === "population50" ? 220 : 440);
      return;
    }
    const density = mode === "slats50" ? 0.5 : 1;
    buildSparseVegetationMarkers(scene, root, primaryColor, density, mode === "slats50" ? 90 : 170);
    buildSlatWaffle(scene, root, 0, 0, { ...grass, density });
    return;
  }
  if (sourceShape.type !== "fieldFlower") {
    buildUnsupportedMarker(scene, root, sourceShape.type, petalColor);
    return;
  }
  if (!flowerPreview) {
    if (mode === "slats50" || mode === "slats100") buildSlatWaffle(scene, root, 0, 0, { ...grass, density: mode === "slats50" ? 0.5 : 1 });
    return;
  }

  if (mode === "flowerCloseup") {
    const flowerRoot = new TransformNode("flower-closeup", scene);
    flowerRoot.position.set(0, 0, -0.08);
    flowerRoot.scaling.setAll(3.2);
    flowerRoot.parent = root;
    buildFlower(scene, flowerRoot, flowerPreview, petalColor);
    return;
  }

  if (mode === "population50" || mode === "population100") {
    const density = mode === "population50" ? 0.5 : 1;
    buildVegetationPopulation(scene, root, flowerPreview, petalColor, density, mode === "population50" ? 500 : 1000);
    return;
  }

  const density = mode === "slats50" ? 0.5 : 1;
  if (flowerPreview.hasPetals || flowerPreview.hasCenter) buildSparseVegetationMarkers(scene, root, petalColor, density, mode === "slats50" ? 90 : 170);
  buildSlatWaffle(scene, root, 0, 0, { ...grass, density });
}

function getRenderableFlowerPreview(asset: VegetationSpeciesAssetFile): RecipeFlowerPreview | undefined {
  const sourceShape = asset.species.parts[0].shape;
  if (sourceShape.type !== "fieldFlower") return undefined;
  const recipe = asset.species.constructionRecipe;
  if (!recipe) return { shape: sourceShape, hasStem: true, hasPetals: true, hasCenter: true, stemArcDegrees: 0, stemArcAzimuthDegrees: 0 };
  const phrases = flattenPhrases(recipe.root);
  const stemGrowth = phrases.find((phrase): phrase is Extract<GrowthPhrase, { type: "continue" }> => phrase.type === "continue" && phrase.formAlongPath === "stemSkin");
  const hasStem = Boolean(stemGrowth) || phrases.some((phrase) => phrase.type === "form" && phrase.primitive === "stemSkin");
  const hasPetals = phrases.some(isSaddlePetalForm);
  const hasCenter = phrases.some((phrase) => phrase.type === "form" && phrase.primitive === "centerDisc");
  const leaf = getRecipeLeafPreview(recipe.root);
  if (!hasStem && !hasPetals && !hasCenter && !leaf) return undefined;
  return {
    shape: recipeToFieldFlowerShape(recipe, sourceShape),
    hasStem,
    hasPetals,
    hasCenter,
    stemArcDegrees: stemGrowth?.arcDegrees?.ideal ?? 0,
    stemArcAzimuthDegrees: stemGrowth?.arcAzimuthDegrees?.ideal ?? 0,
    leaf,
  };
}

function getRecipeLeafPreview(root: GrowthPhrase[]): RecipeLeafPreview | undefined {
  for (const phrase of root) {
    if (phrase.type === "branch") {
      const leaf = getFirstLeafForm(phrase.offshoot);
      if (leaf) return makeRecipeLeafPreview(leaf, phrase);
      const nested = getRecipeLeafPreview(phrase.offshoot);
      if (nested) return nested;
    }
    if (phrase.type === "fork") {
      const nested = getRecipeLeafPreview(phrase.continuation);
      if (nested) return nested;
    }
    if (phrase.type === "choose") {
      for (const option of phrase.options) {
        const nested = getRecipeLeafPreview(option.phrase);
        if (nested) return nested;
      }
    }
    if (phrase.type === "form" && phrase.primitive === "leafBlade") return makeRecipeLeafPreview(phrase);
  }
  return undefined;
}

function getFirstLeafForm(phrases: GrowthPhrase[]): FormPhrase | undefined {
  for (const phrase of phrases) {
    if (phrase.type === "form" && phrase.primitive === "leafBlade") return phrase;
    if (phrase.type === "fork") {
      const found = getFirstLeafForm(phrase.continuation);
      if (found) return found;
    }
    if (phrase.type === "branch") {
      const found = getFirstLeafForm(phrase.offshoot);
      if (found) return found;
    }
    if (phrase.type === "choose") {
      for (const option of phrase.options) {
        const found = getFirstLeafForm(option.phrase);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function makeRecipeLeafPreview(leaf: FormPhrase, branch?: BranchPhrase): RecipeLeafPreview {
  return {
    count: branch ? branch.count.ideal : 1,
    length: leaf.length?.ideal ?? 0.09,
    width: leaf.width?.ideal ?? 0.035,
    curl: leaf.curl?.ideal ?? 0,
    deviationDegrees: branch?.deviationDegrees?.ideal ?? 55,
    aroundAxisDegrees: branch?.aroundAxisDegrees?.ideal ?? branch?.sideBiasDegrees?.ideal ?? 0,
    layout: branch?.layout ?? "tip",
    materialId: leaf.materialId,
  };
}

function getPetalMaterialId(asset: VegetationSpeciesAssetFile) {
  const recipePetal = asset.species.constructionRecipe ? flattenPhrases(asset.species.constructionRecipe.root).find(isSaddlePetalForm) : undefined;
  return recipePetal?.materialId ?? asset.species.parts[0].materialId;
}

function isSaddlePetalForm(phrase: GrowthPhrase): phrase is FormPhrase {
  return phrase.type === "form" && phrase.primitive === "saddlePetal";
}

function flattenPhrases(phrases: GrowthPhrase[]): GrowthPhrase[] {
  return phrases.flatMap((phrase) => {
    if (phrase.type === "fork") return [phrase, ...flattenPhrases(phrase.continuation)];
    if (phrase.type === "branch") return [phrase, ...flattenPhrases(phrase.offshoot)];
    if (phrase.type === "choose") return [phrase, ...phrase.options.flatMap((option) => flattenPhrases(option.phrase))];
    return [phrase];
  });
}

function getPreviewVisualSignature(asset: VegetationSpeciesAssetFile, grass: GrassLodSettings, mode?: PreviewMode) {
  const species = asset.species;
  return JSON.stringify({
    mode,
    shape: species.parts[0].shape,
    materials: Object.fromEntries(Object.entries(species.materials).map(([id, mat]) => [id, { baseColor: mat.baseColor, alpha: mat.alpha, emissiveColor: mat.emissiveColor, emissiveStrength: mat.emissiveStrength }])),
    recipe: species.parts[0].shape.type === "fieldFlower" && species.constructionRecipe ? {
      languageVersion: species.constructionRecipe.languageVersion,
      root: species.constructionRecipe.root.map(phraseVisualSignature),
    } : null,
    grass,
  });
}

function phraseVisualSignature(phrase: GrowthPhrase): unknown {
  if (phrase.type === "fork") {
    const { id: _id, label: _label, continuation, ...visual } = phrase;
    return { ...visual, continuation: continuation.map(phraseVisualSignature) };
  }
  if (phrase.type === "branch") {
    const { id: _id, label: _label, offshoot, ...visual } = phrase;
    return { ...visual, offshoot: offshoot.map(phraseVisualSignature) };
  }
  if (phrase.type === "choose") {
    const { id: _id, label: _label, options, ...visual } = phrase;
    return { ...visual, options: options.map((option) => ({ weight: option.weight, phrase: option.phrase.map(phraseVisualSignature) })) };
  }
  const { id: _id, label: _label, ...visual } = phrase;
  return visual;
}

function getCameraTarget(asset: VegetationSpeciesAssetFile, mode: PreviewMode, focusPhraseId?: string) {
  if (mode !== "flowerCloseup") return new Vector3(0, 0.15, 0);
  const shape = asset.species.parts[0].shape;
  if (shape.type === "cloverCluster") return new Vector3(0, midpoint(shape.lift) * 4.5, 0);
  if (shape.type === "tallFlower") return new Vector3(0, midpoint(shape.stemHeight) * 2.5, 0);
  if (shape.type !== "fieldFlower") return new Vector3(0, 0.42, 0);
  const stemHeight = midpoint(shape.stemHeight);
  const centerRadius = midpoint(shape.centerRadius);
  const phrase = focusPhraseId ? findPhrase(asset.species.constructionRecipe?.root ?? [], focusPhraseId) : undefined;
  const scale = 3.2;

  if (!phrase) return new Vector3(0, (stemHeight + centerRadius * 0.2) * scale, 0);
  if (phrase.type === "continue") return new Vector3(0, stemHeight * scale * 0.48, 0);
  if (phrase.type === "branch" && phrase.layout === "alongPath") return new Vector3(0, stemHeight * scale * 0.55, 0);
  if (phrase.type === "form" && (phrase.primitive === "stemSkin" || phrase.primitive === "leafBlade")) return new Vector3(0, stemHeight * scale * 0.52, 0);
  return new Vector3(0, (stemHeight + centerRadius * 0.24) * scale, 0);
}

function findPhrase(phrases: GrowthPhrase[], id: string): GrowthPhrase | undefined {
  for (const phrase of phrases) {
    if (phrase.id === id) return phrase;
    if (phrase.type === "fork") {
      const found = findPhrase(phrase.continuation, id);
      if (found) return found;
    }
    if (phrase.type === "branch") {
      const found = findPhrase(phrase.offshoot, id);
      if (found) return found;
    }
    if (phrase.type === "choose") {
      for (const option of phrase.options) {
        const found = findPhrase(option.phrase, id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function buildUnsupportedMarker(scene: Scene, parent: TransformNode, shapeType: string, color: string) {
  const mat = material(scene, `unsupported-${shapeType}`, color);
  const marker = MeshBuilder.CreateBox(`unsupported-${shapeType}-marker`, { width: 0.42, height: 0.42, depth: 0.42 }, scene);
  marker.material = mat;
  marker.parent = parent;
  marker.position.y = 0.25;
}

function buildCloverCluster(scene: Scene, parent: TransformNode, shape: CloverShape, color: string) {
  const leafMat = material(scene, "clover-leaf-mat", color);
  const stemMat = material(scene, "clover-stem-mat", "#477c38");
  const leafCount = Math.max(3, Math.round(midpoint(shape.leafCount)));
  const leafRadius = midpoint(shape.leafRadius);
  const clusterRadius = midpoint(shape.clusterRadius);
  const lift = midpoint(shape.lift);

  const stem = MeshBuilder.CreateCylinder("clover-stem", { height: Math.max(0.01, lift), diameter: leafRadius * 0.18, tessellation: 5 }, scene);
  stem.bakeTransformIntoVertices(Matrix.Translation(0, lift * 0.5, 0));
  stem.material = stemMat;
  stem.parent = parent;

  for (let index = 0; index < leafCount; index += 1) {
    const theta = (index / leafCount) * Math.PI * 2;
    const leaf = MeshBuilder.CreateSphere(`clover-leaf-${index}`, { diameter: 1, segments: 10 }, scene);
    leaf.material = leafMat;
    leaf.parent = parent;
    leaf.position.set(Math.cos(theta) * clusterRadius * 0.32, lift, Math.sin(theta) * clusterRadius * 0.32);
    leaf.scaling.set(leafRadius * 1.15, leafRadius * 0.16, leafRadius * 0.82);
    leaf.rotation.y = theta;
    leaf.rotation.x = -0.18;
  }
}

function buildCloverPopulation(scene: Scene, parent: TransformNode, shape: CloverShape, color: string, count: number) {
  const mat = material(scene, "clover-population-mat", color);
  const leafCount = Math.max(3, Math.round(midpoint(shape.leafCount)));
  const leafRadius = midpoint(shape.leafRadius) * 0.7;
  const clusterRadius = midpoint(shape.clusterRadius);
  const lift = midpoint(shape.lift);
  const leaf = MeshBuilder.CreateSphere("clover-population-leaf", { diameter: 1, segments: 6 }, scene);
  leaf.material = mat;
  leaf.parent = parent;
  const matrices = new Float32Array(count * leafCount * 16);
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const angle = hash(index, 51) * Math.PI * 2;
    const distance = Math.sqrt(hash(index, 52)) * 3.7;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const yaw = hash(index, 53) * Math.PI * 2;
    for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
      const theta = yaw + ((leafIndex / leafCount) * Math.PI * 2);
      Matrix.Scaling(leafRadius * 1.15, leafRadius * 0.14, leafRadius * 0.82)
        .multiply(Matrix.RotationY(theta))
        .multiply(Matrix.Translation(x + Math.cos(theta) * clusterRadius * 0.22, lift, z + Math.sin(theta) * clusterRadius * 0.22))
        .copyToArray(matrices, cursor * 16);
      cursor += 1;
    }
  }
  leaf.thinInstanceSetBuffer("matrix", matrices, 16);
  leaf.thinInstanceRefreshBoundingInfo();
}

function buildTallFlower(scene: Scene, parent: TransformNode, shape: TallFlowerShape, flowerColor: string, stemColor: string) {
  const stemHeight = midpoint(shape.stemHeight);
  const stemRadius = midpoint(shape.stemRadius);
  const headRadius = shape.head.type === "tulipCup" ? midpoint(shape.head.diameter) * 0.5 : 0.05;
  const stem = MeshBuilder.CreateCylinder("tall-stem", { height: 1, diameter: 1, tessellation: 7 }, scene);
  stem.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  stem.scaling.set(stemRadius, stemHeight, stemRadius);
  stem.material = material(scene, "tall-stem-mat", stemColor);
  stem.parent = parent;

  if (shape.leaves) {
    const leafCount = Math.round(midpoint(shape.leaves.count));
    const leafLength = midpoint(shape.leaves.length);
    const leafWidth = midpoint(shape.leaves.width);
    const leafMat = material(scene, "tall-leaf-mat", "#4c9a4b");
    leafMat.backFaceCulling = false;
    for (let index = 0; index < leafCount; index += 1) {
      const theta = (index / Math.max(1, leafCount)) * Math.PI * 2;
      const leaf = MeshBuilder.CreatePlane(`tall-leaf-${index}`, { width: leafWidth, height: leafLength }, scene);
      leaf.material = leafMat;
      leaf.parent = parent;
      leaf.position.set(Math.cos(theta) * stemRadius * 1.2, stemHeight * (0.28 + index * 0.18), Math.sin(theta) * stemRadius * 1.2);
      leaf.rotation.y = theta;
      leaf.rotation.x = Math.PI / 2.8;
    }
  }

  const petalCount = shape.head.type === "tulipCup" && shape.head.petalCount ? Math.round(midpoint(shape.head.petalCount)) : 8;
  const flowerMat = material(scene, "tall-flower-head-mat", flowerColor);
  for (let index = 0; index < petalCount; index += 1) {
    const theta = (index / petalCount) * Math.PI * 2;
    const petal = MeshBuilder.CreateSphere(`tall-petal-${index}`, { diameter: 1, segments: 10 }, scene);
    petal.material = flowerMat;
    petal.parent = parent;
    petal.position.set(Math.cos(theta) * headRadius * 0.48, stemHeight + headRadius * 0.25, Math.sin(theta) * headRadius * 0.48);
    petal.scaling.set(headRadius * 0.48, headRadius * 0.95, headRadius * 0.22);
    petal.rotation.y = theta;
    petal.rotation.x = -0.35;
  }
}

function buildTallFlowerPopulation(scene: Scene, parent: TransformNode, shape: TallFlowerShape, flowerColor: string, stemColor: string, count: number) {
  const stemHeight = midpoint(shape.stemHeight) * 0.8;
  const stemRadius = midpoint(shape.stemRadius) * 0.8;
  const headRadius = (shape.head.type === "tulipCup" ? midpoint(shape.head.diameter) * 0.5 : 0.05) * 0.8;
  const stem = MeshBuilder.CreateCylinder("tall-population-stem", { height: 1, diameter: 1, tessellation: 5 }, scene);
  stem.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  stem.material = material(scene, "tall-population-stem-mat", stemColor);
  stem.parent = parent;
  const head = MeshBuilder.CreateSphere("tall-population-head", { diameter: 1, segments: 7 }, scene);
  head.material = material(scene, "tall-population-head-mat", flowerColor);
  head.parent = parent;
  const stemMatrices = new Float32Array(count * 16);
  const headMatrices = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    const angle = hash(index, 61) * Math.PI * 2;
    const distance = Math.sqrt(hash(index, 62)) * 3.65;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const scale = 0.75 + hash(index, 63) * 0.45;
    Matrix.Scaling(stemRadius * scale, stemHeight * scale, stemRadius * scale)
      .multiply(Matrix.Translation(x, 0, z))
      .copyToArray(stemMatrices, index * 16);
    Matrix.Scaling(headRadius * scale, headRadius * 1.15 * scale, headRadius * scale)
      .multiply(Matrix.Translation(x, stemHeight * scale, z))
      .copyToArray(headMatrices, index * 16);
  }
  stem.thinInstanceSetBuffer("matrix", stemMatrices, 16);
  head.thinInstanceSetBuffer("matrix", headMatrices, 16);
  stem.thinInstanceRefreshBoundingInfo();
  head.thinInstanceRefreshBoundingInfo();
}

function buildVegetationPopulation(scene: Scene, parent: TransformNode, preview: RecipeFlowerPreview, petalColor: string, density: number, count: number) {
  const shape = preview.shape;
  const radius = 3.65;
  const plantScale = density === 1 ? 0.66 : 0.72;
  const petalCount = Math.max(5, Math.round((shape.petalCount.min + shape.petalCount.max) / 2));
  const petalLength = midpoint(shape.petalLength) * plantScale;
  const petalWidth = midpoint(shape.petalWidth) * plantScale;
  const stemHeight = midpoint(shape.stemHeight) * plantScale;
  const stemRadius = midpoint(shape.stemRadius) * plantScale;
  const centerRadius = midpoint(shape.centerRadius) * plantScale;

  const stem = MeshBuilder.CreateCylinder("population-stem-source", { height: 1, diameter: 1, tessellation: 5 }, scene);
  stem.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
  stem.material = material(scene, "population-stem-mat", "#486d2f");
  stem.parent = parent;

  const center = MeshBuilder.CreateSphere("population-center-source", { diameter: 1, segments: 6 }, scene);
  center.material = material(scene, "population-center-mat", "#f0c75e");
  center.parent = parent;

  const petal = buildSaddlePetal(scene, shape);
  petal.material = material(scene, "population-petal-mat", petalColor);
  petal.parent = parent;

  const stemMatrices = new Float32Array(count * 16);
  const centerMatrices = new Float32Array(count * 16);
  const petalMatrices = new Float32Array(count * petalCount * 16);
  let petalCursor = 0;

  for (let index = 0; index < count; index += 1) {
    const angle = hash(index, 31) * Math.PI * 2;
    const distance = Math.sqrt(hash(index, 32)) * radius;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const yaw = hash(index, 33) * Math.PI * 2;
    const scale = 0.75 + (hash(index, 34) * 0.5);
    const world = Matrix.Translation(x, 0, z);
    const facing = Matrix.RotationY(yaw);
    const headLift = Matrix.Translation(0, stemHeight * scale, 0);

    if (preview.hasStem) {
      Matrix.Scaling(stemRadius * scale, stemHeight * scale, stemRadius * scale)
        .multiply(world)
        .copyToArray(stemMatrices, index * 16);
    }

    if (preview.hasCenter) {
      Matrix.Scaling(centerRadius * scale, centerRadius * 0.62 * scale, centerRadius * scale)
        .multiply(headLift)
        .multiply(facing)
        .multiply(world)
        .copyToArray(centerMatrices, index * 16);
    }

    for (let petalIndex = 0; preview.hasPetals && petalIndex < petalCount; petalIndex += 1) {
      const theta = ((petalIndex / petalCount) * Math.PI * 2) + ((hash(index + petalIndex, 35) - 0.5) * 0.16);
      Matrix.Scaling(petalWidth * scale, petalLength * scale, petalLength * scale)
        .multiply(Matrix.Translation(0, 0, centerRadius * 0.55 * scale))
        .multiply(Matrix.RotationX(-0.72))
        .multiply(Matrix.RotationY(theta))
        .multiply(headLift)
        .multiply(facing)
        .multiply(world)
        .copyToArray(petalMatrices, petalCursor * 16);
      petalCursor += 1;
    }
  }

  if (preview.hasStem) {
    stem.thinInstanceSetBuffer("matrix", stemMatrices, 16);
    stem.thinInstanceRefreshBoundingInfo();
  } else stem.dispose();
  if (preview.hasCenter) {
    center.thinInstanceSetBuffer("matrix", centerMatrices, 16);
    center.thinInstanceRefreshBoundingInfo();
  } else center.dispose();
  if (preview.hasPetals) {
    petal.thinInstanceSetBuffer("matrix", petalMatrices, 16);
    petal.thinInstanceRefreshBoundingInfo();
  } else petal.dispose();
}

function buildSparseVegetationMarkers(scene: Scene, parent: TransformNode, color: string, density: number, count: number) {
  const mat = material(scene, `sparse-veg-${density}`, color);
  for (let index = 0; index < count; index += 1) {
    const angle = hash(index, 41) * Math.PI * 2;
    const distance = Math.sqrt(hash(index, 42)) * 3.75;
    const marker = MeshBuilder.CreateSphere(`sparse-veg-${index}`, { diameter: 0.045 + (hash(index, 43) * 0.035), segments: 5 }, scene);
    marker.material = mat;
    marker.parent = parent;
    marker.position.set(Math.cos(angle) * distance, 0.07, Math.sin(angle) * distance);
  }
}

function buildFlower(scene: Scene, parent: TransformNode, preview: RecipeFlowerPreview, petalColor: string) {
  const shape = preview.shape;
  const petal = buildSaddlePetal(scene, shape);
  petal.material = material(scene, "preview-petal", petalColor);
  petal.setEnabled(false);

  let stem: Mesh | undefined;
  if (preview.hasStem) {
    stem = MeshBuilder.CreateCylinder("preview-stem", { height: 1, diameter: 1, tessellation: 6 }, scene);
    stem.bakeTransformIntoVertices(Matrix.Translation(0, 0.5, 0));
    stem.material = material(scene, "preview-stem-mat", "#486d2f");
    stem.parent = parent;
  }

  let center: Mesh | undefined;
  if (preview.hasCenter) {
    center = MeshBuilder.CreateSphere("preview-center", { diameter: 1, segments: 10 }, scene);
    center.material = material(scene, "preview-center-mat", "#f0c75e");
    center.parent = parent;
  }

  const petalCount = Math.round((shape.petalCount.min + shape.petalCount.max) / 2);
  const petalLength = midpoint(shape.petalLength);
  const petalWidth = midpoint(shape.petalWidth);
  const stemHeight = midpoint(shape.stemHeight);
  const stemRadius = midpoint(shape.stemRadius);
  const centerRadius = midpoint(shape.centerRadius);

  stem?.scaling.set(stemRadius, stemHeight, stemRadius);
  center?.scaling.set(centerRadius, centerRadius * 0.62, centerRadius);
  if (center) center.position.y = stemHeight;

  for (let index = 0; preview.hasPetals && index < petalCount; index += 1) {
    const instance = petal.clone(`preview-petal-${index}`);
    if (!instance) continue;
    instance.setEnabled(true);
    instance.parent = parent;
    instance.scaling.set(petalWidth, petalLength, petalLength);
    instance.position.y = stemHeight;
    instance.rotation.x = -0.72;
    instance.rotation.y = (index / petalCount) * Math.PI * 2;

    const displayPetal = MeshBuilder.CreateSphere(`preview-display-petal-${index}`, { segments: 10, diameter: 1 }, scene);
    displayPetal.material = petal.material;
    displayPetal.parent = parent;
    const theta = (index / petalCount) * Math.PI * 2;
    displayPetal.position.set(Math.cos(theta) * centerRadius * 0.95, stemHeight + (centerRadius * 0.18), Math.sin(theta) * centerRadius * 0.95);
    displayPetal.scaling.set(petalWidth * 0.85, petalLength * 0.14, petalLength * 0.46);
    displayPetal.rotation.y = theta;
    displayPetal.rotation.x = -0.28;
  }
}

function buildSaddlePetal(scene: Scene, shape: FieldFlowerShapeDefinition): Mesh {
  const mesh = new Mesh("preview-saddle-petal", scene);
  applySaddlePetalGeometry(mesh, shape);
  return mesh;
}

function applySaddlePetalGeometry(mesh: Mesh, shape: FieldFlowerShapeDefinition) {
  const widthCols = 5;
  const lengthRows = 6;
  const cupAmount = midpoint(shape.cup);
  const curlAmount = midpoint(shape.curl);
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < lengthRows; row += 1) {
    const v = row / (lengthRows - 1);
    const halfWidth = 0.5 * Math.max(0.04, Math.sin(Math.PI * Math.min(1, 0.12 + (v * 0.92))));
    for (let col = 0; col < widthCols; col += 1) {
      const ux = ((col / (widthCols - 1)) * 2) - 1;
      positions.push(ux * halfWidth, (cupAmount * ux * ux) - (curlAmount * ((2 * v) - 1) ** 2), v);
    }
  }

  for (let row = 0; row < lengthRows - 1; row += 1) {
    for (let col = 0; col < widthCols - 1; col += 1) {
      const a = (row * widthCols) + col;
      const b = a + 1;
      const c = a + widthCols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(mesh, true);
}

function buildGrassPatch(scene: Scene, parent: TransformNode, label: string, x: number, z: number, density: number, color: string) {
  const count = Math.round(28 + (density * 72));
  const mat = material(scene, `${label}-mat`, color);
  mat.backFaceCulling = false;
  for (let index = 0; index < count; index += 1) {
    const blade = MeshBuilder.CreatePlane(`${label}-blade-${index}`, { width: 0.045, height: 0.32 + (hash(index, 4) * 0.24) }, scene);
    blade.material = mat;
    blade.parent = parent;
    blade.position.set(x + ((hash(index, 1) - 0.5) * 1.55), 0.18, z + ((hash(index, 2) - 0.5) * 1.2));
    blade.rotation.y = hash(index, 3) * Math.PI;
  }
}

function buildSlatWaffle(scene: Scene, parent: TransformNode, x: number, z: number, grass: GrassLodSettings) {
  const mesh = new Mesh("lod-slat-waffle", scene);
  applySlatWaffleGeometry(mesh, x, z, grass);
  mesh.parent = parent;
  mesh.material = slatMaterial(scene, grass);
  mesh.isPickable = false;
}

function applySlatWaffleGeometry(mesh: Mesh, x: number, z: number, grass: GrassLodSettings) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexIndex = 0;
  const width = 5.6;
  const depth = 3.15;
  const spacing = 0.52 / Math.sqrt(Math.max(0.25, grass.density));

  const addStripRun = (alongX: boolean) => {
    const runMin = alongX ? -width / 2 : -depth / 2;
    const runMax = alongX ? width / 2 : depth / 2;
    const crossMin = alongX ? -depth / 2 : -width / 2;
    const crossMax = alongX ? depth / 2 : width / 2;
    const normalX = alongX ? 0 : 1;
    const normalZ = alongX ? 1 : 0;

    for (let cross = crossMin + spacing * 0.5; cross < crossMax; cross += spacing) {
      const jitteredCross = cross + ((hash(Math.round(cross * 100), 7) - 0.5) * spacing * 0.38);
      const heightFactor = 0.72 + (hash(Math.round(cross * 100), 8) * 0.42);
      let previousBottom = -1;
      let previousTop = -1;
      let runDistance = 0;

      for (let run = runMin; run <= runMax + 0.001; run += spacing) {
        const jitter = (hash(Math.round((run + cross) * 100), alongX ? 9 : 10) - 0.5) * spacing * 0.18;
        const px = x + (alongX ? run : jitteredCross + jitter);
        const pz = z + (alongX ? jitteredCross + jitter : run);
        const height = 0.48 * heightFactor;

        positions.push(px, 0.03, pz, px, height, pz);
        normals.push(normalX, 0, normalZ, normalX, 0, normalZ);
        uvs.push(runDistance * 1.45, 0, runDistance * 1.45, 1);

        const bottom = vertexIndex;
        const top = vertexIndex + 1;
        vertexIndex += 2;
        if (previousBottom >= 0) {
          indices.push(previousBottom, bottom, previousTop, bottom, top, previousTop);
        }
        previousBottom = bottom;
        previousTop = top;
        runDistance += spacing;
      }
    }
  };

  addStripRun(true);
  addStripRun(false);

  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh, true);
}

function slatMaterial(scene: Scene, grass: GrassLodSettings) {
  const texture = new DynamicTexture("lod-slat-alpha-texture", { width: 256, height: 256 }, scene, false);
  paintSlatTexture(texture, grass);

  if (!Effect.ShadersStore.previewSlatsVertexShader) {
    Effect.ShadersStore.previewSlatsVertexShader = `
      precision highp float;
      attribute vec3 position;
      attribute vec3 normal;
      attribute vec2 uv;
      uniform mat4 worldViewProjection;
      varying vec2 vUv;
      varying float vTop;
      void main(void) {
        vUv = uv;
        vTop = uv.y;
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;
    Effect.ShadersStore.previewSlatsFragmentShader = `
      precision highp float;
      varying vec2 vUv;
      varying float vTop;
      uniform sampler2D bladeTexture;
      void main(void) {
        vec4 sampleColor = texture2D(bladeTexture, vec2(fract(vUv.x), 1.0 - vUv.y));
        if (sampleColor.a < 0.08) {
          discard;
        }
        float light = mix(0.62, 1.0, vTop);
        gl_FragColor = vec4(sampleColor.rgb * light, sampleColor.a * 0.72);
      }
    `;
  }

  const mat = new ShaderMaterial("lod-slat-waffle-mat", scene, "previewSlats", {
    attributes: ["position", "normal", "uv"],
    uniforms: ["worldViewProjection"],
    samplers: ["bladeTexture"],
    needAlphaBlending: true,
    needAlphaTesting: true,
  });
  mat.setTexture("bladeTexture", texture);
  mat.metadata = { bladeTexture: texture };
  mat.backFaceCulling = false;
  return mat;
}

function updateSlatMaterial(mat: ShaderMaterial, grass: GrassLodSettings) {
  const texture = mat.metadata?.bladeTexture as DynamicTexture | undefined;
  if (!texture) return;
  paintSlatTexture(texture, grass);
}

function paintSlatTexture(texture: DynamicTexture, grass: GrassLodSettings) {
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 256, 256);

  for (let index = 0; index < 42; index += 1) {
    const t = hash(index, 12);
    const color = mixHex(index % 2 === 0 ? grass.topColorA : grass.topColorB, grass.bottomColor, t * 0.45);
    const baseX = hash(index, 13) * 256;
    const bladeHeight = 76 + (hash(index, 14) * 152);
    const bladeWidth = 1.2 + (hash(index, 15) * 3.1);
    context.globalAlpha = 0.36 + (hash(index, 16) * 0.38);
    context.strokeStyle = color;
    context.lineWidth = bladeWidth;
    context.beginPath();
    context.moveTo(baseX, 252);
    context.bezierCurveTo(baseX - 8 + (hash(index, 17) * 16), 220, baseX + 14 - (hash(index, 18) * 28), 166, baseX + ((hash(index, 19) - 0.5) * 34), 256 - bladeHeight);
    context.stroke();
  }
  context.globalAlpha = 1;
  texture.update(false);
  texture.hasAlpha = true;
  texture.uScale = 4.5;
  texture.vScale = 1;
}

function material(scene: Scene, name: string, color: string) {
  const mat = new StandardMaterial(name, scene);
  const value = Color3.FromHexString(color);
  mat.diffuseColor = value;
  mat.specularColor = new Color3(0.08, 0.08, 0.08);
  return mat;
}

function midpoint(range: { min: number; max: number }) {
  return (range.min + range.max) / 2;
}

function hash(seed: number, salt: number) {
  const value = Math.sin((seed + 1) * (salt * 93.17)) * 43758.5453;
  return value - Math.floor(value);
}

function mixHex(a: string, b: string, amount: number): `#${string}` {
  const left = Color3.FromHexString(a);
  const right = Color3.FromHexString(b);
  const mixed = Color3.Lerp(left, right, Math.max(0, Math.min(1, amount)));
  return mixed.toHexString() as `#${string}`;
}
