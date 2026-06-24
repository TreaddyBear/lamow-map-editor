import type {
  Area,
  AreaShape,
  DirtPath,
  Distribution,
  Fence,
  FoliageType,
  HeightFeature,
  LevelV1,
  MapPackV1,
  PathShape,
  Point2,
  Road,
  VegetationLayer,
} from "./model";
import { clone, defaultPack, foliageRegistry } from "./model";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePack(value: MapPackV1): MapPackV1 {
  return {
    version: 1,
    units: "meters",
    coordinates: value.coordinates,
    pack: {
      prefix: value.pack?.prefix ?? "bgrn",
      name: value.pack?.name ?? "Beta Green",
    },
    levels: (value.levels?.length ? value.levels : [clone(defaultPack.levels[0])]).map(normalizeLevel),
  };
}

export function normalizeLevel(level: LevelV1): LevelV1 {
  return {
    code: level.code ?? "level",
    name: level.name ?? "Level",
    parSeconds: Math.max(1, Number(level.parSeconds) || 300),
    spawn: {
      position: normalizePoint2(level.spawn?.position ?? [0, 0], [0, 0]),
      headingDegrees: Number(level.spawn?.headingDegrees) || 0,
    },
    areas: (level.areas ?? []).map(normalizeArea),
    roads: (level.roads ?? []).map(normalizeRoad),
    dirtPaths: (level.dirtPaths ?? []).map(normalizeDirtPath),
    fences: (level.fences ?? []).map(normalizeFence),
    terrain: { heightFeatures: (level.terrain?.heightFeatures ?? []).map(normalizeHeightFeature) },
    objects: Array.isArray(level.objects) ? level.objects : [],
    tags: level.tags,
  };
}

export function normalizeArea(area: Area): Area {
  return {
    ...area,
    kind: "area",
    id: area.id || "area",
    shape: normalizeAreaShape(area.shape, { type: "rectangle", center: [0, 0], size: [4, 4] }),
    vegetation: (area.vegetation ?? []).map(normalizeVegetationLayer),
    children: area.children?.map(normalizeArea),
  };
}

export function normalizeVegetationLayer(layer: VegetationLayer): VegetationLayer {
  return {
    id: layer.id || "vegetation",
    type: foliageType(layer.type),
    distribution: normalizeDistribution(layer.distribution),
  };
}

export function normalizeRoad(item: Road): Road {
  return { ...item, kind: "road", id: item.id || "road", width: Number(item.width) || 3.2, shape: normalizePathShape(item.shape) };
}

export function normalizeDirtPath(item: DirtPath): DirtPath {
  return { ...item, kind: "dirtPath", id: item.id || "dirtPath", width: Number(item.width) || 1.1, shape: normalizePathShape(item.shape) };
}

export function normalizeFence(item: Fence): Fence {
  return { ...item, kind: "fence", id: item.id || "fence", height: Number(item.height) || 1, postSpacing: item.postSpacing, shape: normalizePathShape(item.shape) };
}

export function normalizeHeightFeature(item: HeightFeature): HeightFeature {
  return {
    ...item,
    type: "hill",
    id: item.id || "hill",
    shape: normalizeAreaShape(item.shape, { type: "circle", center: [0, 0], radius: 3 }),
    height: Number(item.height) || 1,
    falloff: Number(item.falloff) || 1,
  };
}

export function normalizeDistribution(distribution: Distribution | unknown): Distribution {
  if (isRecord(distribution) && distribution.type === "perlin") {
    const noise = isRecord(distribution.noise) ? distribution.noise : {};
    const octaves = Array.isArray(noise.octaves)
      ? noise.octaves.filter(isRecord).map((octave) => ({ frequency: finiteNumber(octave.frequency, 0.4), weight: finiteNumber(octave.weight, 1) }))
      : [{ frequency: 0.4, weight: 1 }];
    return {
      type: "perlin",
      density: finiteNumber(distribution.density, 1),
      noise: {
        seed: finiteNumber(noise.seed, 1),
        octaves,
        domainWarp: noise.domainWarp === undefined ? undefined : finiteNumber(noise.domainWarp, 0),
        threshold: finiteNumber(noise.threshold, 0.5),
        softness: finiteNumber(noise.softness, 0.12),
      },
    };
  }
  return { type: "uniform", density: isRecord(distribution) ? finiteNumber(distribution.density, 1) : 1 };
}

export function normalizePoint2(value: unknown, fallback: Point2): Point2 {
  if (Array.isArray(value) && value.length >= 2) return [round(Number(value[0]) || 0), round(Number(value[1]) || 0)];
  if (isRecord(value)) return [round(Number(value.x) || fallback[0]), round(Number(value.z) || fallback[1])];
  return fallback;
}

export function normalizeAreaShape(value: unknown, fallback: AreaShape): AreaShape {
  if (!isRecord(value)) return fallback;
  if (value.type === "circle") {
    return { type: "circle", center: normalizePoint2(value.center, [0, 0]), radius: Math.max(0.1, Number(value.radius) || 1) };
  }
  if (value.type === "polygon") {
    const points = Array.isArray(value.points) ? value.points.map((point) => normalizePoint2(point, [0, 0])) : [];
    return { type: "polygon", points: points.length >= 3 ? points : [[-2, -2], [2, -2], [0, 2]] };
  }
  return {
    type: "rectangle",
    center: normalizePoint2(value.center, [0, 0]),
    size: normalizePoint2(value.size, [4, 4]),
    rotationDegrees: value.rotationDegrees === undefined ? undefined : Number(value.rotationDegrees) || 0,
  };
}

export function normalizePathShape(value: unknown): PathShape {
  if (!isRecord(value)) return { type: "line", start: [-2, 0], end: [2, 0] };
  if (value.type === "polyline") {
    const points = Array.isArray(value.points) ? value.points.map((point) => normalizePoint2(point, [0, 0])) : [];
    return { type: "polyline", points: points.length >= 2 ? points : [[-2, 0], [2, 0]] };
  }
  if (value.type === "cubicBezierPath") {
    const curves = Array.isArray(value.curves)
      ? value.curves.filter(isRecord).map((curve) => ({
          c1: normalizePoint2(curve.c1, [0, 0]),
          c2: normalizePoint2(curve.c2, [0, 0]),
          end: normalizePoint2(curve.end, [0, 0]),
        }))
      : [];
    return { type: "cubicBezierPath", start: normalizePoint2(value.start, [0, 0]), curves };
  }
  return { type: "line", start: normalizePoint2(value.start, [-2, 0]), end: normalizePoint2(value.end, [2, 0]) };
}

function foliageType(value: unknown): FoliageType {
  return foliageRegistry.some((entry) => entry.key === value) ? (value as FoliageType) : "grass";
}
