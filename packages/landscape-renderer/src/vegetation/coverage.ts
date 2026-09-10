import type { VegetationSpeciesAssetFile } from "./assets.js";
import type { VegetationPlacement } from "./speciesLayer.js";

export const defaultPlantsPerSquareMeter = 25;
export function fullCoverage(asset: VegetationSpeciesAssetFile) {
  return asset.species.coverage?.plantsPerSquareMeter ?? defaultPlantsPerSquareMeter;
}

/** Stable low-discrepancy placements: changing density retains existing plant identities.
 * Density is an authored multiplier (1 = the species' calibrated 100%).
 * Consumers with terrain/exclusion policies may filter these candidate placements.
 */
export function createVegetationPatchPlacements(asset: VegetationSpeciesAssetFile, options: {
  width: number; depth?: number; density?: number; seed?: number;
}): VegetationPlacement[] {
  const { width, depth = width, density = 1, seed = 1 } = options;
  if (![width, depth, density, seed].every(Number.isFinite) || width <= 0 || depth <= 0 || density < 0) throw new Error("Invalid coverage patch.");
  const rate = fullCoverage(asset);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("100% coverage must be positive and finite.");
  const count = Math.round(rate * width * depth * density);
  if (count > 100_000) throw new Error("Coverage patch exceeds 100,000 plants. Reduce patch size or coverage.");
  const offset = ((Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0) / 4294967296;
  return Array.from({ length: count }, (_, i) => ({
    x: (((0.5 + offset + i * 0.7548776662466927) % 1) - 0.5) * width,
    z: (((0.5 + offset + i * 0.5698402909980532) % 1) - 0.5) * depth,
    seed: (seed + i) >>> 0,
  }));
}
