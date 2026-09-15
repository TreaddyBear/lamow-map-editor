import { Matrix, type Mesh } from "@babylonjs/core";
import type { PreviewField, FieldPoint } from "./previewField.js";

/** Bounded per-instance pressure, modeled after LaMow's hold/re-aim/slow release.
 * Spatial buckets restrict hover work; geometry and materials are never rebuilt. */
export function createBrushMotion(mesh: Mesh, kind: "plant" | "grass", ranks?: number[], attributes: { kind: string; stride: number; data: Float32Array }[] = []) {
  const matrices = mesh.thinInstanceGetWorldMatrices().map(matrix => matrix.clone()), count = matrices.length;
  const original = new Float32Array(count * 16), rest = new Float32Array(count * 16);
  // Per-instance attributes must follow the same compaction as transforms.
  const channels = attributes.map(attribute => ({ ...attribute, original: attribute.data.slice() }));
  const writeAttributes = (source: number, slot: number) => {
    for (const channel of channels) for (let j = 0; j < channel.stride; j++) channel.data[slot * channel.stride + j] = channel.original[source * channel.stride + j];
  };
  const uploadAttributes = () => channels.forEach(channel => mesh.thinInstanceBufferUpdated(channel.kind));
  matrices.forEach((m, i) => m.copyToArray(original, i * 16)); rest.set(original);
  const pressure = new Float32Array(count), directions = new Float32Array(count * 2);
  const slots = Int32Array.from({ length: count }, (_, i) => i);
  const active = new Set<number>(), buckets = new Map<string, number[]>(), temp = Matrix.Identity();
  const cellSize = 0.5;
  for (let i = 0; i < count; i++) { const key = Math.floor(original[i * 16 + 12] / cellSize) + ":" + Math.floor(original[i * 16 + 14] / cellSize); const bucket = buckets.get(key) ?? []; bucket.push(i); buckets.set(key, bucket); }
  let hover: (FieldPoint & { radius: number }) | undefined, visibleCount = count;
  const neighbors = (point: FieldPoint, radius: number) => {
    const found: number[] = [];
    for (let z = Math.floor((point.z - radius) / cellSize); z <= Math.floor((point.z + radius) / cellSize); z++) for (let x = Math.floor((point.x - radius) / cellSize); x <= Math.floor((point.x + radius) / cellSize); x++) {
      for (const i of buckets.get(x + ":" + z) ?? []) if ((original[i * 16 + 12] - point.x) ** 2 + (original[i * 16 + 14] - point.z) ** 2 < radius * radius) found.push(i);
    }
    return found;
  };
  // Babylon retains this Matrix in its instance cache. Each instance must own one.
  const write = (i: number) => { const slot = slots[i]; matrices[slot].copyFrom(temp); mesh.thinInstanceSetMatrixAt(slot, matrices[slot], false); };
  return {
    mesh,
    get visibleCount() { return visibleCount; },
    get movingCount() { return active.size; },
    hover(point: FieldPoint | undefined, radius = 0.45) { hover = point ? { ...point, radius } : undefined; },
    applyField(field: PreviewField) {
      visibleCount = 0;
      mesh.thinInstanceCount = count;
      for (let i = 0; i < count; i++) {
        const o = i * 16, state = field.sample(original[o + 12], original[o + 14]);
        const rank = ranks?.[i] ?? (i + 0.5) / Math.max(1, count);
        const exists = !state.cut && (kind === "plant" ? rank < state.density : rank >= state.density);
        for (let j = 0; j < 16; j++) rest[o + j] = exists ? original[o + j] : 0;
        slots[i] = exists ? visibleCount++ : -1;
        if (exists) { Matrix.FromArrayToRef(rest, o, temp); write(i); writeAttributes(i, slots[i]); }
        else { pressure[i] = 0; active.delete(i); }
      }
      // Draw only the visible prefix; retain capacity and stable plant identities.
      mesh.thinInstanceCount = visibleCount;
      mesh.thinInstanceGetWorldMatrices().length = visibleCount;
      if (visibleCount) { mesh.thinInstanceBufferUpdated("matrix"); uploadAttributes(); mesh.thinInstanceRefreshBoundingInfo(); }
      mesh.setEnabled(visibleCount > 0);
    },
    tick(delta: number) {
      const dt = Math.min(0.05, Math.max(0, delta));
      if (hover) for (const i of neighbors(hover, hover.radius * 1.3)) active.add(i);
      if (!active.size) return false;
      let animating = false;
      for (const i of active) {
        const o = i * 16;
        if (!rest[o + 15]) { active.delete(i); continue; }
        const dx = hover ? original[o + 12] - hover.x : 0, dz = hover ? original[o + 14] - hover.z : 0, distance = Math.hypot(dx, dz);
        const target = hover ? Math.max(0, Math.min(1, (hover.radius * 1.3 - distance) / (hover.radius * 0.5))) : 0;
        const previous = pressure[i];
        if (target > 0) {
          pressure[i] += (Math.max(pressure[i], target) - pressure[i]) * (1 - Math.exp(-24 * dt));
          if (distance > 1e-6) { directions[i * 2] = dx / distance; directions[i * 2 + 1] = dz / distance; } else { directions[i * 2] = 1; directions[i * 2 + 1] = 0; }
        } else pressure[i] = Math.max(0, pressure[i] - dt * 0.45);
        if (Math.abs(previous - pressure[i]) > 0.0001 || (target === 0 && pressure[i] > 0)) animating = true;
        const a = pressure[i] * 0.85, c = Math.cos(a), s = Math.sin(a), ax = directions[i * 2 + 1], az = -directions[i * 2];
        Matrix.FromArrayToRef(rest, o, temp);
        const output = temp.asArray();
        for (let col = 0; col < 3; col++) {
          const j = col * 4, x = rest[o + j], y = rest[o + j + 1], z = rest[o + j + 2], dot = ax * x + az * z;
          output[j] = x * c - az * y * s + ax * dot * (1 - c);
          output[j + 1] = y * c + (az * x - ax * z) * s;
          output[j + 2] = z * c + ax * y * s + az * dot * (1 - c);
        }
        temp.markAsUpdated(); write(i);
        if (pressure[i] <= 0) active.delete(i);
      }
      mesh.thinInstanceBufferUpdated("matrix");
      return animating;
    },
    restore() { rest.set(original); pressure.fill(0); hover = undefined; visibleCount = count; mesh.thinInstanceCount = count; for (let i = 0; i < count; i++) { slots[i] = i; Matrix.FromArrayToRef(original, i * 16, temp); write(i); writeAttributes(i, i); } mesh.thinInstanceBufferUpdated("matrix"); uploadAttributes(); mesh.setEnabled(count > 0); active.clear(); },
  };
}
export type BrushMotion = ReturnType<typeof createBrushMotion>;
