import { Color3, Matrix, Mesh, Quaternion, StandardMaterial, Vector3, VertexData, type Scene, type TransformNode } from "@babylonjs/core";
import type { VegetationSpeciesAssetFile } from "./assets.js";
import { compileVegetationPlant, type CompiledPlantPart } from "./recipe.js";
import { createVegetationRandom } from "./random.js";

export type VegetationPlacement = { x: number; z: number; seed: number; yaw?: number; scale?: number };
export type VegetationGeometryCache = { signature?: string; plants: Map<number, CompiledPlantPart[]> };
type Batch = { key: string; mesh: Mesh; source: Float32Array; buffer: Float32Array; plantIndices: number[] };

/** Bounded shared geometry pool; exact same seed selects the same plant in any host. */
export function createVegetationSpeciesLayer(input: {
  scene: Scene;
  asset: VegetationSpeciesAssetFile;
  groundHeightAt: (x: number, z: number) => number;
  parent?: TransformNode;
  layerMask?: number;
  geometryCache?: VegetationGeometryCache;
}) {
  let asset = input.asset;
  let plants: VegetationPlacement[] = [];
  let batches: Batch[] = [];
  const materialMap = new Map<string, StandardMaterial>();
  let geometrySignature = "";
  let placementSignature = "";
  const mowed = new Set<number>();
  const hidden = new Set<number>();
  let disposed = false;
  const clearGeometry = () => {
    for (const batch of batches) batch.mesh.dispose();
    for (const material of materialMap.values()) material.dispose();
    batches = []; materialMap.clear();
  };
  const refresh = () => {
    for (const batch of batches) {
      let changed = false;
      batch.plantIndices.forEach((plantIndex, i) => {
        const collapsed = mowed.has(plantIndex) || hidden.has(plantIndex);
        const offset = i * 16;
        for (let j = 0; j < 16; j++) {
          if (batch.buffer[offset + j] === (collapsed ? 0 : batch.source[offset + j])) continue;
          // Update Babylon's CPU matrix cache as well as its GPU buffer.
          batch.mesh.thinInstanceSetMatrixAt(i, collapsed ? Matrix.Zero() : Matrix.FromArray(batch.source, offset), false);
          changed = true;
          break;
        }
      });
      if (changed) { batch.mesh.thinInstanceBufferUpdated("matrix"); batch.mesh.thinInstanceRefreshBoundingInfo(); }
    }
  };
  const rebuild = (placementsChanged = false) => {
    if (disposed) throw new Error("Vegetation layer is disposed.");
    const nextGeometrySignature = JSON.stringify([asset.species.constructionRecipe ?? asset.species.parts, asset.primitives], (key, value) => key === "label" || key === "displayName" ? undefined : value);
    const nextPlacementSignature = JSON.stringify(asset.species.instanceRanges);
    const geometryChanged = nextGeometrySignature !== geometrySignature;
    const transformsChanged = placementsChanged || nextPlacementSignature !== placementSignature;
    for (const [id, definition] of Object.entries(asset.species.materials)) {
      let material = materialMap.get(id);
      if (!material) {
        material = new StandardMaterial("species-" + asset.species.id + "-" + id, input.scene);
        material.specularColor = Color3.Black(); material.backFaceCulling = false; material.twoSidedLighting = true;
        materialMap.set(id, material);
      }
      material.diffuseColor = Color3.FromHexString(definition.baseColor);
      material.emissiveColor = Color3.FromHexString(definition.emissiveColor ?? "#000000").scale(definition.emissiveStrength ?? 0);
      material.alpha = definition.alpha ?? 1;
    }
    if (!geometryChanged && !transformsChanged) return;
    const groups = new Map<number, number[]>();
    plants.forEach((plant, index) => {
      const seed = (plant.seed >>> 0) % 16;
      const indices = groups.get(seed) ?? []; indices.push(index); groups.set(seed, indices);
    });
    // Compile before touching visible resources. A bad draft leaves the last valid plant intact.
    const cache = input.geometryCache;
    if (cache && cache.signature !== nextGeometrySignature) { cache.plants.clear(); cache.signature = nextGeometrySignature; }
    const compiled = new Map([...groups.keys()].map((seed) => {
      const parts = cache?.plants.get(seed) ?? compileVegetationPlant(asset, seed);
      cache?.plants.set(seed, parts);
      return [seed, parts];
    }));
    const previous = new Map(batches.map((batch) => [batch.key, batch]));
    const next: Batch[] = [];
    for (const [seed, plantIndices] of groups) {
      const parts = compiled.get(seed)!;
      for (const [materialId, material] of materialMap) {
        const selected = parts.filter((part) => part.materialId === materialId);
        if (!selected.length) continue;
        const key = seed + ":" + materialId;
        let batch = previous.get(key);
        previous.delete(key);
        const fresh = !batch;
        if (!batch) {
          const mesh = new Mesh("species-" + asset.species.id + "-" + seed + "-" + materialId, input.scene);
          mesh.material = material; mesh.useVertexColors = true; mesh.isPickable = false;
          mesh.parent = input.parent ?? null;
          if (input.layerMask !== undefined) mesh.layerMask = input.layerMask;
          batch = { key, mesh, source: new Float32Array(0), buffer: new Float32Array(0), plantIndices };
        }
        if (fresh || geometryChanged) {
          const positions: number[] = [], indices: number[] = [], colors: number[] = [], normals: number[] = [];
          for (const part of selected) {
            const offset = positions.length / 3;
            positions.push(...part.positions); indices.push(...part.indices.map((index) => index + offset)); colors.push(...part.colors);
          }
          VertexData.ComputeNormals(positions, indices, normals);
          const mesh = batch.mesh;
          if (mesh.getTotalVertices() === positions.length / 3 && mesh.getTotalIndices() === indices.length) {
            mesh.updateVerticesData("position", positions, true);
            mesh.updateVerticesData("normal", normals);
            mesh.updateVerticesData("color", colors);
            mesh.updateIndices(indices);
          } else {
            const data = new VertexData(); data.positions = positions; data.indices = indices; data.colors = colors; data.normals = normals;
            data.applyToMesh(mesh, true);
          }
        }
        if (fresh || transformsChanged) {
          const source = new Float32Array(plantIndices.length * 16);
          plantIndices.forEach((index, i) => {
            const plant = plants[index];
            const random = createVegetationRandom(plant.seed);
            const scaleUnit = random(), yawUnit = random();
            const scale = plant.scale ?? asset.species.instanceRanges.scale.min + scaleUnit * (asset.species.instanceRanges.scale.max - asset.species.instanceRanges.scale.min);
            const yawRange = asset.species.instanceRanges.yaw;
            const yawSpan = Math.min(Math.PI * 2, yawRange.max - yawRange.min);
            const yaw = plant.yaw ?? (yawRange.min + yawRange.max) / 2 + (yawUnit - 0.5) * yawSpan;
            Matrix.Compose(new Vector3(scale, scale, scale), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(plant.x, input.groundHeightAt(plant.x, plant.z), plant.z)).copyToArray(source, i * 16);
          });
          batch.source = source; batch.buffer = source.slice(); batch.plantIndices = plantIndices;
          batch.mesh.thinInstanceSetBuffer("matrix", batch.buffer, 16, false);
        }
        batch.mesh.thinInstanceRefreshBoundingInfo(true);
        next.push(batch);
      }
    }
    for (const batch of previous.values()) batch.mesh.dispose();
    batches = next;
    for (const [id, material] of materialMap) {
      if (!asset.species.materials[id]) { material.dispose(); materialMap.delete(id); }
    }
    geometrySignature = nextGeometrySignature; placementSignature = nextPlacementSignature;
    refresh();
  };
  return {
    get meshes() { return batches.map((batch) => batch.mesh); },
    get plantCount() { return plants.length; },
    setAsset(next: VegetationSpeciesAssetFile) { asset = next; rebuild(); },
    setPlants(next: VegetationPlacement[]) {
      if (next.some((plant) => ![plant.x, plant.z, plant.seed, plant.yaw ?? 0, plant.scale ?? 1].every(Number.isFinite))) throw new Error("Plant placements must be finite.");
      plants = next.map((plant) => ({ ...plant })); mowed.clear(); hidden.clear(); rebuild(true);
    },
    mowCircle(x: number, z: number, radius: number) {
      if (![x, z, radius].every(Number.isFinite) || radius < 0) throw new Error("Mowing requires a finite position and nonnegative radius.");
      let changed = 0;
      plants.forEach((plant, index) => {
        if (!mowed.has(index) && (plant.x - x) ** 2 + (plant.z - z) ** 2 <= radius ** 2) { mowed.add(index); changed++; }
      });
      if (changed) refresh();
      return changed;
    },
    setVisible(index: number, visible: boolean) { if (visible) hidden.delete(index); else hidden.add(index); refresh(); },
    syncVisibility(x: number, z: number, radius: number) {
      if (![x, z, radius].every(Number.isFinite) || radius < 0) throw new Error("Visibility requires a finite position and nonnegative radius.");
      let changed = false;
      plants.forEach((plant, index) => {
        const hide = (plant.x - x) ** 2 + (plant.z - z) ** 2 > radius ** 2;
        if (hide === hidden.has(index)) return;
        if (hide) hidden.add(index); else hidden.delete(index);
        changed = true;
      });
      if (changed) refresh();
    },
    resetMowed() { mowed.clear(); refresh(); },
    dispose() { if (!disposed) { clearGeometry(); plants = []; disposed = true; } },
  };
}

export type VegetationSpeciesLayer = ReturnType<typeof createVegetationSpeciesLayer>;
