/** Seamless multi-scale noise, rank-normalized so coverage remains an area fraction. */
export function createCoverageNoise(size = 128) {
  const hash = (x: number, y: number) => { let n = Math.imul(x + 113, 374761393) ^ Math.imul(y + 217, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const noise = (x: number, y: number, period: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(ix % period, iy % period), b = hash((ix + 1) % period, iy % period), c = hash(ix % period, (iy + 1) % period), d = hash((ix + 1) % period, (iy + 1) % period);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const values = Array.from({ length: size * size }, (_, i) => { const x = i % size / size, y = Math.floor(i / size) / size; return { i, value: noise(x * 8, y * 8, 8) * 0.6 + noise(x * 17, y * 17, 17) * 0.28 + noise(x * 31, y * 31, 31) * 0.12 }; }).sort((a, b) => a.value - b.value);
  const data = new Uint8Array(size * size * 4);
  values.forEach(({ i }, rank) => { const v = Math.floor((rank + 0.5) / values.length * 256); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; });
  return data;
}

/** Threshold before mipmapping. Averaging ranked noise before thresholding would
 * turn distant mixed coverage into solid grass or vegetation as detail shrinks. */
export function createCoverageMask(coverage: number, ranks: Uint8Array) {
  const mask = new Uint8Array(ranks.length);
  for (let i = 0; i < ranks.length; i += 4) {
    const value = (ranks[i] + 0.5) / 256 < coverage ? 255 : 0;
    mask[i] = mask[i + 1] = mask[i + 2] = value; mask[i + 3] = 255;
  }
  return mask;
}
