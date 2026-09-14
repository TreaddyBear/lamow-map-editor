import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, MeshBuilder, PointerEventTypes, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { createVegetationSpeciesLayer, createVegetationPatchPlacements, parseVegetationAsset, type VegetationSpeciesAssetFile, type VegetationSpeciesLayer } from "@lamow/landscape-renderer";
import { defaultVegetationAsset } from "@lamow/landscape-renderer/vegetation/assets";
import { Button, FileButton, TopBar, TopBarTitle } from "../Components/Base";

/** Separate scene host: consumes only the portable package and exported asset. */
export function VegetationPlaytestPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [asset, setAsset] = useState<VegetationSpeciesAssetFile>(() => location.state?.asset ?? defaultVegetationAsset);
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<VegetationSpeciesLayer | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const element = canvas.current;
    const engine = new Engine(element, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.80, 0.87, 0.91, 1);
    const camera = new ArcRotateCamera("playtest-camera", -Math.PI / 2.4, Math.PI / 3.1, 7.5, Vector3.Zero(), scene);
    camera.minZ = 0.01;
    camera.lowerRadiusLimit = 2; camera.upperRadiusLimit = 14;
    camera.attachControl(element, true);
    const pointers = camera.inputs.attached.pointers as { buttons?: number[] } | undefined;
    if (pointers) pointers.buttons = [2];
    new HemisphericLight("playtest-light", new Vector3(-0.4, 1, 0.3), scene).intensity = 0.95;
    const ground = MeshBuilder.CreateGround("playtest-ground", { width: 9, height: 9 }, scene);
    const material = new StandardMaterial("playtest-ground-material", scene);
    material.diffuseColor = Color3.FromHexString("#75965f"); material.specularColor = Color3.Black();
    ground.material = material;
    const mower = MeshBuilder.CreateCylinder("mow-radius", { height: 0.008, diameter: 0.9, tessellation: 48 }, scene);
    const mowerMaterial = new StandardMaterial("mow-radius-material", scene);
    mowerMaterial.diffuseColor = Color3.FromHexString("#edf2bb"); mowerMaterial.alpha = 0.5;
    mower.material = mowerMaterial; mower.isPickable = false; mower.setEnabled(false);
    let layer: VegetationSpeciesLayer | undefined;
    setRemaining(0);
    try {
      const portable = parseVegetationAsset(JSON.stringify(asset));
      if (!["fieldFlower", "cloverCluster"].includes(portable.species.parts[0].shape.type)) throw new Error("This playtest supports field flowers and clover.");
      layer = createVegetationSpeciesLayer({ scene, asset: portable, groundHeightAt: () => 0 });
      layer.setPlants(createVegetationPatchPlacements(portable, { width: portable.editor?.preview?.groundPatchMeters ?? 4, seed: portable.editor?.preview?.populationSeed ?? 1 }));
      layerRef.current = layer;
      setRemaining(layer.plantCount); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load this species."); }
    let mowing = false;
    const release = () => { mowing = false; };
    scene.onPointerObservable.add((event) => {
      if (event.type === PointerEventTypes.POINTERDOWN && event.event.button === 0) mowing = true;
      if (event.type === PointerEventTypes.POINTERUP) mowing = false;
      const hit = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === ground);
      mower.setEnabled(Boolean(hit?.pickedPoint));
      if (!hit?.pickedPoint) return;
      mower.position.copyFrom(hit.pickedPoint); mower.position.y = 0.012;
      if (mowing && layer) {
        const cut = layer.mowCircle(hit.pickedPoint.x, hit.pickedPoint.z, 0.45);
        if (cut) setRemaining((value) => value - cut);
      }
    });
    const observer = new ResizeObserver(() => engine.resize()); observer.observe(element);
    window.addEventListener("pointerup", release);
    const stopContextMenu = (event: Event) => event.preventDefault();
    element.addEventListener("contextmenu", stopContextMenu);
    engine.runRenderLoop(() => scene.render());
    return () => {
      observer.disconnect(); window.removeEventListener("pointerup", release); element.removeEventListener("contextmenu", stopContextMenu);
      layerRef.current = null; layer?.dispose(); scene.dispose(); engine.dispose();
    };
  }, [asset]);
  return <main className="grid h-screen grid-rows-[auto_minmax(0,1fr)] gap-3 p-4" data-testid="vegetation-playtest">
    <TopBar>
      <TopBarTitle>{asset.species.displayName} · Playtest</TopBarTitle>
      <span role="status" className="text-sm">{remaining} standing</span>
      <Button onClick={() => { layerRef.current?.resetMowed(); setRemaining(layerRef.current?.plantCount ?? 0); }}>Restore plants</Button>
      <FileButton accept=".json" onFile={(file) => file.text().then((text) => setAsset(parseVegetationAsset(text))).catch((error) => setMessage(error.message))}>Import species</FileButton>
      <Button onClick={() => navigate("/assets")}>Back to assets</Button>
    </TopBar>
    <div className="relative min-h-0 overflow-hidden rounded-lg">
      <canvas ref={canvas} data-testid="playtest-canvas" className="h-full w-full touch-none" />
      {message && <div role="alert" className="absolute left-3 top-3 rounded bg-[var(--app-bg)] p-3">{message}</div>}
    </div>
  </main>;
}
