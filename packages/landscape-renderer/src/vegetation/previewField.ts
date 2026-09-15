export type PreviewBrushMode = "cut" | "flowers" | "grass" | "camera";
export type FieldPoint = { x: number; z: number };

/** Preview-only coverage and mowing are independent. Recipe data never stores a test stroke. */
export function createPreviewField(width: number, coverage: number, resolution = 128) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(coverage) || coverage < 0 || coverage > 1 || !Number.isInteger(resolution) || resolution < 2 || resolution > 512) throw new Error("Invalid preview field.");
  const density = new Float32Array(resolution * resolution).fill(coverage);
  const cut = new Uint8Array(density.length);
  const pixels = new Uint8Array(density.length * 4);
  let revision = 0;
  const indexAt = (x: number, z: number) => Math.min(resolution - 1, Math.max(0, Math.floor((z / width + 0.5) * resolution))) * resolution + Math.min(resolution - 1, Math.max(0, Math.floor((x / width + 0.5) * resolution)));
  const inside = (x: number, z: number) => Math.abs(x) <= width / 2 && Math.abs(z) <= width / 2;
  return {
    width, resolution, density, cut,
    get revision() { return revision; },
    sample(x: number, z: number) { const i = indexAt(x, z); return inside(x, z) ? { density: density[i], cut: cut[i] > 0 } : { density: coverage, cut: false }; },
    reset(value = coverage) { density.fill(value); cut.fill(0); revision++; },
    stroke(from: FieldPoint, to: FieldPoint, radius: number, mode: PreviewBrushMode, softness = 0) {
      if (mode === "camera") return false;
      if (![from.x, from.z, to.x, to.z, radius, softness].every(Number.isFinite) || radius <= 0 || softness < 0 || softness > 1) throw new Error("Invalid brush stroke.");
      const pixel = (v: number) => Math.floor((v / width + 0.5) * resolution);
      const minX = Math.max(0, pixel(Math.min(from.x, to.x) - radius)), maxX = Math.min(resolution - 1, pixel(Math.max(from.x, to.x) + radius));
      const minZ = Math.max(0, pixel(Math.min(from.z, to.z) - radius)), maxZ = Math.min(resolution - 1, pixel(Math.max(from.z, to.z) + radius));
      const dx = to.x - from.x, dz = to.z - from.z, length2 = dx * dx + dz * dz;
      let changed = false;
      for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
        const wx = ((x + 0.5) / resolution - 0.5) * width, wz = ((z + 0.5) / resolution - 0.5) * width;
        const t = length2 ? Math.max(0, Math.min(1, ((wx - from.x) * dx + (wz - from.z) * dz) / length2)) : 0;
        const distance = Math.hypot(wx - from.x - t * dx, wz - from.z - t * dz);
        if (distance >= radius) continue;
        const edge = softness ? Math.max(0, Math.min(1, (distance / radius - 1 + softness) / softness)) : 0;
        const weight = 1 - edge * edge * (3 - 2 * edge);
        const i = z * resolution + x, nextDensity = Math.fround(mode === "flowers" ? Math.max(density[i], weight) : mode === "grass" ? Math.min(density[i], 1 - weight) : density[i]), nextCut = mode === "cut" ? 1 : 0;
        if (density[i] !== nextDensity || cut[i] !== nextCut) { density[i] = nextDensity; cut[i] = nextCut; changed = true; }
      }
      if (changed) revision++;
      return changed;
    },
    textureData() {
      // Texture origin is bottom-left, matching world Z; slats sample without a Y flip.
      for (let i = 0; i < density.length; i++) { pixels[i * 4] = Math.round(density[i] * 255); pixels[i * 4 + 1] = cut[i] * 255; pixels[i * 4 + 3] = 255; }
      return pixels;
    },
  };
}
export type PreviewField = ReturnType<typeof createPreviewField>;
