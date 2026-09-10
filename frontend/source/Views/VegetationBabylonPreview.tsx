import { useEffect, useRef, useState } from "react";
import type { GrassLodSettings, VegetationSpeciesAssetFile } from "../utilities/assets/vegetation";
import type { ObjPrimitiveMesh } from "../utilities/assets/objPrimitives";
import { PreviewPane } from "../Components/Base/PreviewPane";
import { createVegetationWorkspace, previewPaneIds, type PreviewAngle, type PreviewPaneId } from "./vegetationWorkspaceRuntime";

const labels = ["Plant", "50% population", "100% population", "50% LOD", "100% LOD"];
export function VegetationBabylonPreview({ asset, grass, primitiveMeshes, selectedPhraseId }: {
  asset: VegetationSpeciesAssetFile; grass: GrassLodSettings; primitiveMeshes: ObjPrimitiveMesh[]; selectedPhraseId: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const elements = useRef(new Map<PreviewPaneId, HTMLElement>());
  const runtime = useRef<ReturnType<typeof createVegetationWorkspace> | undefined>(undefined);
  const [angles, setAngles] = useState<Record<PreviewPaneId, PreviewAngle>>({ plant: "perspective", half: "perspective", full: "perspective", "lod-half": "perspective", "lod-full": "perspective" });
  const [error, setError] = useState("");
  useEffect(() => {
    try { runtime.current = createVegetationWorkspace(canvas.current!, elements.current, { ...asset, primitives: primitiveMeshes }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the preview."); }
    return () => { runtime.current?.dispose(); runtime.current = undefined; };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { runtime.current?.update({ ...asset, primitives: primitiveMeshes }, grass, selectedPhraseId); setError(""); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not render this recipe."); }
    });
    return () => cancelAnimationFrame(frame);
  }, [asset, grass, primitiveMeshes, selectedPhraseId]);
  return <div className="relative h-full min-h-[540px] overflow-hidden rounded-lg" data-testid="vegetation-workspace">
    <canvas ref={canvas} data-testid="vegetation-preview-board" className="absolute inset-0 h-full w-full" />
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-[1.5fr_1fr_1fr] gap-2">
      {previewPaneIds.map((id, i) => <PreviewPane key={id} id={id} paneRef={element => { if (element) elements.current.set(id, element); else elements.current.delete(id); }} label={labels[i]} kind={i === 0 ? "plant" : i < 3 ? "patch" : "slat"} angle={angles[id]} onAngle={angle => { setAngles(current => ({ ...current, [id]: angle })); runtime.current?.setAngle(id, angle); }} onReset={() => runtime.current?.fit(id)} />)}
    </div>
    {error && <div role="alert" className="absolute inset-x-3 top-12 z-20 rounded bg-[var(--surface-bg)] p-3 text-sm">{error}</div>}
  </div>;
}
