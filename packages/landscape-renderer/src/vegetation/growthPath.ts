import { Quaternion, Vector3 } from "@babylonjs/core";

/** Signed travel L, signed total bend a, azimuth b, t in [0,1]. Local growth starts +Y.
 * p(t) = L/a * ((1-cos(at))*cos(b), sin(at), (1-cos(at))*sin(b)).
 * The frame rotates about (+sin(b),0,-cos(b)); +Y follows p'(t) for positive L.
 * Negative travel moves backward within that frame without reversing it.
 * At a=0 use the straight limit; at L=0 retain the end orientation without travel.
 */
export function growthArcPose(length: number, angleDegrees: number, azimuthDegrees: number, t = 1) {
  const a = angleDegrees * Math.PI / 180, b = azimuthDegrees * Math.PI / 180, u = a * t;
  const radial = Math.abs(a) < 1e-7 ? length * a * t * t / 2 : length * (1 - Math.cos(u)) / a;
  const y = Math.abs(a) < 1e-7 ? length * t : length * Math.sin(u) / a;
  return { position: new Vector3(radial * Math.cos(b), y, radial * Math.sin(b)), rotation: Quaternion.RotationAxis(new Vector3(Math.sin(b), 0, -Math.cos(b)), u) };
}

type Data = { positions: number[]; indices: number[]; colors: number[] };
type V = { p: number[]; c: number[]; weights: Map<number, number> };
/** Slice source triangles into horizontal bands before bending. Preserve source seams,
 * vertex colors, and shared edges; arbitrary editable OBJ stems remain usable. */
export function subdivideGrowthSource(source: Data, segments: number): Data {
  if (segments <= 1) return source;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], vertices = new Map<string, number>();
  const original = (i: number): V => ({ p: source.positions.slice(i * 3, i * 3 + 3), c: source.colors.slice(i * 4, i * 4 + 4), weights: new Map([[i, 1]]) });
  const mix = (a: V, b: V, t: number): V => {
    const weights = new Map<number, number>();
    a.weights.forEach((w, i) => weights.set(i, w * (1 - t))); b.weights.forEach((w, i) => weights.set(i, (weights.get(i) ?? 0) + w * t));
    return { p: a.p.map((v, i) => v + (b.p[i] - v) * t), c: a.c.map((v, i) => v + (b.c[i] - v) * t), weights };
  };
  const clip = (polygon: V[], y: number, above: boolean): V[] => {
    const result: V[] = [];
    polygon.forEach((a, i) => { const b = polygon[(i + 1) % polygon.length], aa = above ? a.p[1] >= y : a.p[1] <= y, bb = above ? b.p[1] >= y : b.p[1] <= y;
      if (aa) result.push(a); if (aa !== bb) result.push(mix(a, b, (y - a.p[1]) / (b.p[1] - a.p[1])));
    }); return result;
  };
  const add = (v: V) => {
    const key = [...v.weights].filter(([,w]) => w > 1e-8).sort(([a],[b]) => a-b).map(([i,w]) => i + ":" + w.toFixed(7)).join(";");
    let index = vertices.get(key); if (index !== undefined) return index;
    index = positions.length / 3; vertices.set(key, index); positions.push(...v.p); colors.push(...v.c); return index;
  };
  for (let i = 0; i < source.indices.length; i += 3) {
    const triangle = source.indices.slice(i, i + 3).map(original);
    const min = Math.min(...triangle.map(v => v.p[1])), max = Math.max(...triangle.map(v => v.p[1]));
    const first = Math.max(0, Math.min(segments - 1, Math.floor(min * segments))), last = Math.max(first, Math.min(segments - 1, Math.ceil(max * segments) - 1));
    for (let band = first; band <= last; band++) {
      let polygon = triangle;
      if (band > 0) polygon = clip(polygon, band / segments, true);
      if (band < segments - 1) polygon = clip(polygon, (band + 1) / segments, false);
      for (let j = 1; j < polygon.length - 1; j++) { const tri = [add(polygon[0]), add(polygon[j]), add(polygon[j+1])]; if (new Set(tri).size === 3) indices.push(...tri); }
    }
  }
  return { positions, colors, indices };
}
