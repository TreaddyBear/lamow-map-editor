import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";
import { fieldFlowerShapeToRecipe, cloverClusterShapeToRecipe, type GrowthPhrase, type IdealVariation, type VegetationSpeciesAssetFile } from "./assets.js";
import { defaultObjPrimitiveLibrary, objPrimitiveToRenderData, type ObjPrimitiveMesh } from "./objPrimitives.js";
import { degreesToRadians, stemGrowthVector, stemOrientationQuaternion } from "./geometry.js";
import { growthArcPose, subdivideGrowthSource } from "./growthPath.js";
import { createVegetationRandom } from "./random.js";

export type CompiledPlantPart = { phraseId: string; materialId: string; positions: number[]; indices: number[]; colors: number[] };
/** Optional measuring hook for the modifier bench; normal rendering allocates no trace records. */
export type VegetationCompileOptions = {
  onSample?: (sample: { phraseId: string; field: string; ideal: number; deviation: number; value: number }) => void;
};
type Cursor = { position: Vector3; rotation: Quaternion; scale: number; materialId: string; lastRoot: Vector3; lastPath?: (t: number) => { position: Vector3; rotation: Quaternion } };
const copyCursor = (cursor: Cursor): Cursor => ({ ...cursor, position: cursor.position.clone(), rotation: cursor.rotation.clone(), lastRoot: cursor.lastRoot.clone() });
const orientedIndices = (indices: number[], mirrored: boolean) => {
  if (!mirrored) return indices;
  const reversed = indices.slice();
  for (let i = 0; i < reversed.length; i += 3) [reversed[i + 1], reversed[i + 2]] = [reversed[i + 2], reversed[i + 1]];
  return reversed;
};

/** Pure seeded construction: no scene, DOM, camera, or gameplay dependencies. */
export function compileVegetationPlant(asset: VegetationSpeciesAssetFile, seed = 1, primitives: ObjPrimitiveMesh[] = asset.primitives ?? defaultObjPrimitiveLibrary(), options?: VegetationCompileOptions): CompiledPlantPart[] {
  const shape = asset.species.parts[0].shape;
  const recipe = asset.species.constructionRecipe ?? (shape.type === "fieldFlower"
    ? fieldFlowerShapeToRecipe(shape, asset.species.parts[0].materialId)
    : shape.type === "cloverCluster" ? cloverClusterShapeToRecipe(shape, asset.species.parts[0].materialId) : undefined);
  if (!recipe) throw new Error(`Shared recipe rendering does not yet support ${shape.type}.`);
  const random = createVegetationRandom(seed);
  let phraseId = "";
  const sample = (field: string, value: IdealVariation | undefined, fallback = 0, circular = false) => {
    // ±180° already reaches every heading. Wrapping a wider interval can weight
    // some headings twice (e.g. ±270°), so orientation randomness saturates here.
    // Path bend and spread are geometric amounts and must retain their full range.
    const deviation = value ? circular ? Math.min(180, value.deviation) : value.deviation : 0;
    const result = value ? value.ideal + (random() * 2 - 1) * deviation : fallback;
    if (options?.onSample) options.onSample({ phraseId, field, ideal: value?.ideal ?? fallback, deviation: value?.deviation ?? 0, value: result });
    return result;
  };
  const count = (value: IdealVariation) => Math.max(0, Math.min(64, Math.round(sample("count", value))));
  const parts: CompiledPlantPart[] = [];
  const sourceData = new Map(primitives.map((primitive) => [primitive.id, objPrimitiveToRenderData(primitive)]));
  let steps = 0;
  const rotate = (cursor: Cursor, vector: Vector3) => vector.rotateByQuaternionToRef(cursor.rotation, new Vector3());
  const emit = (id: string, primitiveId: string, materialId: string, cursor: Cursor, scale: Vector3, cup = 0, curl = 0, endWidth = scale.x, bend = 0) => {
    if (parts.length >= 2048) throw new Error("Recipe exceeds 2048 forms per plant.");
    const source = sourceData.get(primitiveId);
    if (!source) throw new Error(`Missing primitive "${primitiveId}".`);
    const axial = primitiveId === "stemSkin" || primitiveId === "quadSlat";
    const data = { positions: source.positions.slice(), indices: orientedIndices(source.indices, (axial ? scale.y : scale.x * scale.y * scale.z) * cursor.scale < 0), colors: source.colors };
    const matrix = Matrix.Compose(Vector3.One().scale(cursor.scale), cursor.rotation, cursor.position);
    for (let i = 0; i < data.positions.length; i += 3) {
      let x = data.positions[i], y = data.positions[i + 1], z = data.positions[i + 2];
      // Deformation is applied to the editable source, so source edits and recipe controls compose.
      if (primitiveId === "saddlePetal" || primitiveId === "leafBlade") y += cup * x * x + curl * z * z * 0.42;
      if (axial) {
        // Interpolate signed radii directly: a zero start never requires division,
        // and opposite signs pinch through zero instead of exploding a taper ratio.
        x = x * (scale.x + (endWidth - scale.x) * y) + bend * y * y * scale.x;
        z *= scale.z + (endWidth - scale.z) * y;
        y *= scale.y;
      } else { x *= scale.x; y *= scale.y; z *= scale.z; }
      const point = Vector3.TransformCoordinates(new Vector3(x, y, z), matrix);
      data.positions[i] = point.x; data.positions[i + 1] = point.y; data.positions[i + 2] = point.z;
    }
    parts.push({ phraseId: id, materialId, ...data });
  };
  const walk = (phrases: GrowthPhrase[], cursor: Cursor, depth: number) => {
    if (depth > 16) throw new Error("Recipe nesting exceeds 16 levels.");
    for (const phrase of phrases) {
      phraseId = phrase.id;
      if (++steps > 8192) throw new Error("Recipe exceeds the construction budget.");
      if (phrase.type === "continue") {
        const distance = sample("distance", phrase.distance);
        const arc = sample("arcDegrees", phrase.arcDegrees), azimuth = sample("arcAzimuthDegrees", phrase.arcAzimuthDegrees, 0, true);
        const local = stemGrowthVector(distance, arc, azimuth);
        // Signed travel reverses displacement without also reversing the frame.
        const nextRotation = cursor.rotation.multiply(stemOrientationQuaternion(distance === 0 ? Vector3.Zero() : stemGrowthVector(1, arc, azimuth)));
        const radius = sample("radiusStart", phrase.radiusStart, 0.01);
        const endRadius = sample("radiusEnd", phrase.radiusEnd, 0.006);
        if (phrase.pathMode === "arc") {
          const root = copyCursor(cursor);
          const path = (t: number) => { const pose = growthArcPose(distance, arc, azimuth, t); return { position: root.position.add(rotate(root, pose.position).scale(root.scale)), rotation: root.rotation.multiply(pose.rotation) }; };
          if (phrase.formAlongPath && phrase.formAlongPath !== "none" && distance !== 0) {
            if (parts.length >= 2048) throw new Error("Recipe exceeds 2048 forms per plant.");
            const primitive = phrase.formAlongPath === "blade" ? "quadSlat" : "stemSkin";
            const original = sourceData.get(primitive); if (!original) throw new Error(`Missing primitive "${primitive}".`);
            const source = subdivideGrowthSource(original, Math.max(1, Math.ceil(Math.abs(arc) / 12)));
            const positions: number[] = [];
            for (let i = 0; i < source.positions.length; i += 3) {
              const t = source.positions[i + 1], pose = path(t), r = (radius + (endRadius - radius) * t) * 2 * root.scale;
              const offset = new Vector3(source.positions[i] * r, 0, source.positions[i+2] * r).rotateByQuaternionToRef(pose.rotation, new Vector3());
              positions.push(...pose.position.add(offset).asArray());
            }
            parts.push({ phraseId: phrase.id, materialId: cursor.materialId, positions, indices: orientedIndices(source.indices, distance * root.scale < 0), colors: source.colors });
          }
          const end = path(1); cursor.lastRoot = root.position; cursor.position = end.position; cursor.rotation = end.rotation; cursor.lastPath = path;
          continue;
        }
        cursor.lastPath = undefined;
        if (phrase.formAlongPath && phrase.formAlongPath !== "none") {
          emit(phrase.id, phrase.formAlongPath === "blade" ? "quadSlat" : "stemSkin", cursor.materialId,
            { ...cursor, rotation: nextRotation }, new Vector3(radius * 2, distance, radius * 2), 0, 0, endRadius * 2, sample("bend", phrase.bend));
        }
        cursor.lastRoot = cursor.position.clone();
        cursor.position.addInPlace(rotate(cursor, local).scale(cursor.scale));
        cursor.rotation = nextRotation;
      } else if (phrase.type === "steer") {
        cursor.rotation = cursor.rotation.multiply(Quaternion.RotationYawPitchRoll(degreesToRadians(sample("yawDegrees", phrase.yawDegrees, 0, true)), degreesToRadians(sample("pitchDegrees", phrase.pitchDegrees, 0, true)), degreesToRadians(sample("rollDegrees", phrase.rollDegrees, 0, true))));
        cursor.scale *= sample("scale", phrase.scale, 1);
      } else if (phrase.type === "color") {
        cursor.materialId = phrase.materialId;
      } else if (phrase.type === "form") {
        const width = sample("width", phrase.width, phrase.primitive === "centerDisc" ? 0.05 : 0.04);
        const length = sample("length", phrase.length, phrase.primitive === "centerDisc" ? width * 0.62 : 0.09);
        const scale = phrase.primitive === "centerDisc" || phrase.primitive === "stemSkin" || phrase.primitive === "quadSlat"
          ? new Vector3(width, length, width) : new Vector3(width, length, length);
        emit(phrase.id, phrase.primitive, phrase.materialId, cursor, scale, sample("cup", phrase.cup), sample("curl", phrase.curl));
      } else if (phrase.type === "fork") {
        const total = count(phrase.count);
        const spread = degreesToRadians(sample("spreadDegrees", phrase.spreadDegrees, 360));
        const radius = sample("radius", phrase.radius) * cursor.scale;
        for (let i = 0; i < total; i++) {
          const child = copyCursor(cursor);
          const theta = phrase.layout === "sameAxis" ? 0 : phrase.layout === "cluster" ? random() * spread
            : phrase.layout === "mirrored" ? (i % 2 ? 1 : -1) * spread * (Math.floor(i / 2) + 1) / (2 * Math.ceil(total / 2))
            : phrase.layout === "spiral" ? i * 2.399963229728653 * spread / (Math.PI * 2) : i * spread / (Math.abs(Math.abs(spread) - Math.PI * 2) < 0.001 ? total : Math.max(1, total - 1));
          child.position.addInPlace(rotate(cursor, new Vector3(Math.sin(theta) * radius, 0, Math.cos(theta) * radius)));
          child.rotation = child.rotation.multiply(Quaternion.RotationYawPitchRoll(theta, 0, 0));
          walk(phrase.continuation, child, depth + 1);
        }
      } else if (phrase.type === "branch") {
        const total = count(phrase.count);
        for (let i = 0; i < total; i++) {
          const child = copyCursor(cursor);
          const t = phrase.layout === "tip" || phrase.layout === "fromForm" ? 1 : phrase.layout === "radial" ? 0.5 : (i + 1) / (total + 1);
          const attachment = cursor.lastPath?.(t);
          child.position = attachment?.position ?? Vector3.Lerp(cursor.lastRoot, cursor.position, t);
          if (attachment) child.rotation = attachment.rotation;
          phraseId = phrase.id;
          const around = degreesToRadians(sample("aroundAxisDegrees", phrase.aroundAxisDegrees ?? phrase.sideBiasDegrees, 0, true));
          const theta = around + (phrase.layout === "alternating" ? i * Math.PI : i * Math.PI * 2 / Math.max(1, total));
          child.rotation = child.rotation.multiply(Quaternion.RotationYawPitchRoll(theta, -degreesToRadians(sample("deviationDegrees", phrase.deviationDegrees ?? { ideal: 55, deviation: 8 })), 0));
          walk(phrase.offshoot, child, depth + 1);
        }
      } else if (phrase.type === "choose") {
        const total = phrase.options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
        let target = random() * total;
        for (const option of phrase.options) {
          target -= Math.max(0, option.weight);
          if (target < 0) { walk(option.phrase, cursor, depth + 1); break; }
        }
      }
    }
  };
  walk(recipe.root, { position: Vector3.Zero(), lastRoot: Vector3.Zero(), rotation: Quaternion.Identity(), scale: 1, materialId: asset.species.materials.stem ? "stem" : asset.species.parts[0].materialId }, 0);
  return parts;
}
