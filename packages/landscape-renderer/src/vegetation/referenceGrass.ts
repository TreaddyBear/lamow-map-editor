import { Color3, Matrix, Mesh, PBRMaterial, Quaternion, Vector3, VertexData, type Scene } from "@babylonjs/core";
import { gameBladeGeometry, gameBladesPerSquareMeter, gameGrassSettings as settings } from "./gameReference/settings.js";
import { grassNoiseAt, randomHash } from "./gameReference/noise.js";
import { color3ToHsl, hslToColor3 } from "./gameReference/color.js";

/** The game's long blade, height/color distribution and normal-lawn area budget.
 * Flat, uncut reference patch; deterministic placements keep comparisons steady. */
export function createReferenceGrass(scene: Scene, layerMask = 2) {
  const mesh = new Mesh("reference-grass", scene); mesh.layerMask = layerMask; mesh.isPickable = false;
  const material = new PBRMaterial("reference-grass-material", scene);
  material.albedoColor = Color3.White(); material.roughness = settings.grassRoughness; material.metallic = settings.grassMetallic;
  material.clearCoat.isEnabled = true; material.clearCoat.intensity = settings.grassClearCoat;
  material.backFaceCulling = false; material.twoSidedLighting = true; mesh.material = material;
  const data = new VertexData(); Object.assign(data, gameBladeGeometry); data.applyToMesh(mesh);
  const base = color3ToHsl(Color3.FromHexString(settings.grassBaseColor));
  let key = "";
  return {
    mesh,
    update(width: number, coverage = 0.5, seed = 1) {
      const next = `${width}:${coverage}:${seed}`; if (key === next) return;
      const count = Math.round(width * width * gameBladesPerSquareMeter * coverage);
      const matrices = new Float32Array(count * 16), colors = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const x = (randomHash(i + seed, 1) - 0.5) * width, z = (randomHash(i + seed, 2) - 0.5) * width;
        const noise = grassNoiseAt(x, z);
        const height = settings.minHeight + (settings.maxHeight - settings.minHeight) *
          (noise * settings.clumpStrength + randomHash(i + seed, 3) * settings.heightRandomness) / Math.max(0.01, settings.clumpStrength + settings.heightRandomness);
        Matrix.Compose(new Vector3(1, height, 1), Quaternion.FromEulerAngles(0, randomHash(i + seed, 4) * Math.PI * 2, 0), new Vector3(x, 0, z)).copyToArray(matrices, i * 16);
        const shade = Math.min(1, Math.max(0, noise + (randomHash(i, i * 0.37) - 0.5) * 0.12)) - 0.5;
        const color = hslToColor3(base.h + shade * settings.hueVariance, base.s + shade * settings.satVariance, base.l + shade * settings.lightVariance);
        colors.set([color.r, color.g, color.b, 1], i * 4);
      }
      mesh.setEnabled(count > 0);
      mesh.thinInstanceSetBuffer("matrix", matrices, 16, true); mesh.thinInstanceSetBuffer("color", colors, 4, true);
      if (count) mesh.thinInstanceRefreshBoundingInfo(); key = next;
    },
    dispose() { mesh.dispose(); material.dispose(); },
  };
}
