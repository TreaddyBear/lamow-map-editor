import { parseVegetationAsset, type VegetationSpeciesAssetFile } from "./vegetation";
import { validateObjPrimitiveMesh, type ObjPrimitiveMesh } from "./objPrimitives";

export const vegetationDraftKey = "lamow.vegetation-drafts.v1";
export type VegetationDrafts = { speciesAssets: VegetationSpeciesAssetFile[]; primitiveMeshes: ObjPrimitiveMesh[]; sourcePrimitiveMeshes?: ObjPrimitiveMesh[]; selectedSpeciesId: string };

export function readVegetationDrafts(): { drafts?: VegetationDrafts; error?: string } {
  try {
    const text = localStorage.getItem(vegetationDraftKey);
    if (!text) return {};
    const value = JSON.parse(text) as VegetationDrafts;
    if (!Array.isArray(value.speciesAssets) || !value.speciesAssets.length || !Array.isArray(value.primitiveMeshes)) throw new Error();
    const speciesAssets = value.speciesAssets.map((asset) => parseVegetationAsset(JSON.stringify(asset)));
    value.primitiveMeshes.forEach(validateObjPrimitiveMesh);
    value.sourcePrimitiveMeshes?.forEach(validateObjPrimitiveMesh);
    return { drafts: { ...value, speciesAssets } };
  } catch {
    return { error: "Saved drafts could not be loaded. Export your work before leaving this page; the previous saved data has been retained." };
  }
}
