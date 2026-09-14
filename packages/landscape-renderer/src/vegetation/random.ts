/** Deterministic 32-bit mixing for procedural geometry, including adjacent seeds.
 * The variant pool deliberately uses 0–15; a raw LCG's first draw barely changes
 * between these seeds. Mix every draw before converting to a unit interval.
 */
export function createVegetationRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A field keeps its draw when unrelated fields/components are inserted or edited.
 * Component IDs survive saving/duplication; instance paths distinguish repeated children.
 */
export function vegetationFieldRandom(seed: number, key: string) {
  let hash = (seed >>> 0) ^ 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return createVegetationRandom(hash)();
}
