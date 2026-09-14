/** Radius whose disk covers `coverage` of a unit square, including clipped corners.
 * sqrt(coverage/π) alone is correct only up to π/4 coverage.
 * Computed on coverage changes, never per fragment.
 */
export function coverageDotRadius(coverage: number) {
  if (coverage <= 0) return 0;
  if (coverage >= 1) return Math.SQRT1_2;
  if (coverage <= Math.PI / 4) return Math.sqrt(coverage / Math.PI);
  let low = 0.5, high = Math.SQRT1_2;
  for (let i = 0; i < 24; i++) {
    const radius = (low + high) / 2, square = radius * radius;
    const area = Math.PI * square - 4 * (square * Math.acos(0.5 / radius) - 0.5 * Math.sqrt(square - 0.25));
    if (area < coverage) low = radius; else high = radius;
  }
  return (low + high) / 2;
}
