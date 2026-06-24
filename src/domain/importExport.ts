import { normalizeRect, rectFromCenter } from "./geometry";
import {
  normalizeArea,
  normalizeAreaShape,
  normalizeDirtPath,
  normalizeFence,
  normalizeHeightFeature,
  normalizeLevel,
  normalizePack,
  normalizePoint2,
  normalizeRoad,
  normalizeVegetationLayer,
} from "./normalization";
import {
  clone,
  defaultCoordinates,
  defaultPack,
  defaultPerlinDistribution,
  type Area,
  type CoordinateMetadata,
  type DirtPath,
  type Fence,
  type FoliageType,
  type HeightFeature,
  type LegacyMapSpec,
  type LevelV1,
  type MapPackV1,
  type Point2,
  type Rect,
  type Road,
  type Spawn,
  type VegetationLayer,
} from "./model";

export type ImportResult = { pack: MapPackV1; message: string };

function round(value: number): number {
  return Number(value.toFixed(3));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function exportJsonValue(pack: MapPackV1): MapPackV1 {
  return normalizePack(pack);
}

export function importJsonText(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Could not parse JSON. The file may be incomplete or have a trailing comma. ${detail}`);
  }
  return importJsonValue(parsed);
}

export function importJsonValue(parsed: unknown): ImportResult {
  if (isV1Pack(parsed)) return { pack: importV1Pack(parsed), message: `Imported draft v1 pack with ${parsed.levels.length} level(s).` };
  if (isRecord(parsed) && Array.isArray(parsed.maps)) {
    const maps = parsed.maps.map(importLegacyMap);
    return { pack: { ...clone(defaultPack), levels: maps }, message: `Imported ${maps.length} old prototype map(s) and converted them to draft v1.` };
  }
  if (Array.isArray(parsed)) {
    const maps = parsed.map(importLegacyMap);
    return { pack: { ...clone(defaultPack), levels: maps }, message: `Imported ${maps.length} old prototype map(s) and converted them to draft v1.` };
  }
  if (isRecord(parsed) && Array.isArray(parsed.areas) && "code" in parsed) {
    return { pack: { ...clone(defaultPack), levels: [importV1Level(parsed)] }, message: "Imported one draft v1 level." };
  }
  if (isRecord(parsed) && (Array.isArray(parsed.segments) || Array.isArray(parsed.fenceSegments))) {
    return { pack: { ...clone(defaultPack), levels: [importLegacyMap(parsed)] }, message: "Imported old prototype map and converted it to draft v1." };
  }
  throw new Error("Import must be a draft v1 pack, one v1 level, or old prototype map JSON.");
}

function isV1Pack(value: unknown): value is Record<string, unknown> & { levels: unknown[] } {
  return isRecord(value) && value.version === 1 && Array.isArray(value.levels);
}

function importV1Pack(value: Record<string, unknown> & { levels: unknown[] }): MapPackV1 {
  const packInfo = isRecord(value.pack) ? value.pack : {};
  return normalizePack({
    version: 1,
    units: "meters",
    coordinates: isRecord(value.coordinates) ? (value.coordinates as CoordinateMetadata) : defaultCoordinates,
    pack: { prefix: String(packInfo.prefix ?? "bgrn"), name: String(packInfo.name ?? "Beta Green") },
    levels: value.levels.map(importV1Level),
  });
}

function importV1Level(value: unknown): LevelV1 {
  if (!isRecord(value)) throw new Error("Level entry must be an object.");
  return normalizeLevel({
    code: String(value.code ?? "level"),
    name: String(value.name ?? "Level"),
    parSeconds: Number(value.parSeconds) || 300,
    spawn: importSpawn(value.spawn),
    areas: Array.isArray(value.areas) ? value.areas.map(importArea) : [],
    roads: Array.isArray(value.roads) ? value.roads.map((item) => normalizeRoad(item as Road)) : [],
    dirtPaths: Array.isArray(value.dirtPaths) ? value.dirtPaths.map((item) => normalizeDirtPath(item as DirtPath)) : [],
    fences: Array.isArray(value.fences) ? value.fences.map((item) => normalizeFence(item as Fence)) : [],
    terrain: isRecord(value.terrain) && Array.isArray(value.terrain.heightFeatures) ? { heightFeatures: value.terrain.heightFeatures.map((item) => normalizeHeightFeature(item as HeightFeature)) } : { heightFeatures: [] },
    objects: Array.isArray(value.objects) ? value.objects : [],
    tags: Array.isArray(value.tags) ? value.tags.map(String) : undefined,
  });
}

function importSpawn(value: unknown): Spawn {
  if (!isRecord(value)) return { position: [0, 0], headingDegrees: 0 };
  return {
    position: normalizePoint2(value.position ?? value, [0, 0]),
    headingDegrees: Number(value.headingDegrees) || 0,
  };
}

function importArea(value: unknown): Area {
  if (!isRecord(value)) return normalizeArea({ id: "area", kind: "area", shape: { type: "rectangle", center: [0, 0], size: [4, 4] }, vegetation: [] });
  return normalizeArea({
    ...(value as Partial<Area>),
    id: String(value.id ?? "area"),
    kind: "area",
    shape: normalizeAreaShape(value.shape, { type: "rectangle", center: [0, 0], size: [4, 4] }),
    vegetation: Array.isArray(value.vegetation) ? value.vegetation.map((item) => normalizeVegetationLayer(item as VegetationLayer)) : [],
    children: Array.isArray(value.children) ? value.children.map(importArea) : undefined,
  });
}

function importLegacyMap(value: unknown): LevelV1 {
  if (!isRecord(value)) throw new Error("Map entry must be an object.");
  const legacy = value as LegacyMapSpec;
  const segments = Array.isArray(legacy.segments) ? legacy.segments.map(importLegacyRect) : [];
  const lawnAreas = segments.map((rect, index) => legacySegmentToArea(rect, index, legacy));
  return normalizeLevel({
    code: legacyCodeToV1(legacy.code),
    name: String(legacy.name ?? "Imported Map"),
    parSeconds: Number(legacy.parSeconds) || 300,
    spawn: { position: normalizePoint2(legacy.spawn, [0, 0]), headingDegrees: 0 },
    areas: lawnAreas.length > 0 ? lawnAreas : [legacySegmentToArea({ xMin: -5, xMax: 5, zMin: -5, zMax: 5 }, 0, legacy)],
    roads: [],
    dirtPaths: [],
    fences: Array.isArray(legacy.fenceSegments) ? legacy.fenceSegments.map(importLegacyFence) : [],
    terrain: { heightFeatures: [] },
    objects: [],
    tags: ["convertedFromPrototype"],
  });
}

function legacyCodeToV1(value: unknown): string {
  const code = String(value ?? "importedMap").trim() || "importedMap";
  const prefix = defaultPack.pack.prefix;
  if (code.toLowerCase().startsWith(prefix.toLowerCase()) && code.length > prefix.length) {
    const local = code.slice(prefix.length);
    return `${local.charAt(0).toLowerCase()}${local.slice(1)}`;
  }
  return code;
}

function importLegacyRect(value: unknown): Rect {
  if (!isRecord(value)) return { xMin: -2, xMax: 2, zMin: -2, zMax: 2 };
  if (isRecord(value.center)) {
    const center = normalizePoint2(value.center, [0, 0]);
    const width = Number(value.width) || Math.abs(Number(value.xMax) - Number(value.xMin)) || 4;
    const height = Number(value.height) || Math.abs(Number(value.zMax) - Number(value.zMin)) || 4;
    return rectFromCenter(center, [width, height]);
  }
  return normalizeRect({
    xMin: Number(value.xMin) || 0,
    xMax: Number(value.xMax) || 0,
    zMin: Number(value.zMin) || 0,
    zMax: Number(value.zMax) || 0,
  });
}

function legacySegmentToArea(rect: Rect, index: number, legacy: LegacyMapSpec): Area {
  const normalized = normalizeRect(rect);
  const area: Area = {
    id: index === 0 ? "lawnArea" : `lawnArea${index + 1}`,
    kind: "area",
    role: "lawn",
    shape: { type: "rectangle", center: [round((normalized.xMin + normalized.xMax) / 2), round((normalized.zMin + normalized.zMax) / 2)], size: [round(normalized.xMax - normalized.xMin), round(normalized.zMax - normalized.zMin)] },
    vegetation: [{ id: index === 0 ? "grassLayer" : `grassLayer${index + 1}`, type: "grass", distribution: { type: "uniform", density: 1 } }],
    children: [],
  };

  if (index === 0) {
    legacy.flowerBeds?.forEach((bed, bedIndex) => {
      const bedRect = importLegacyRect(bed);
      area.children?.push({
        id: `flowerBed${bedIndex + 1}`,
        kind: "area",
        role: "bed",
        shape: { type: "rectangle", center: [round((bedRect.xMin + bedRect.xMax) / 2), round((bedRect.zMin + bedRect.zMax) / 2)], size: [round(bedRect.xMax - bedRect.xMin), round(bedRect.zMax - bedRect.zMin)] },
        vegetation: [{ id: `tulipLayer${bedIndex + 1}`, type: "tulip", distribution: { type: "uniform", density: Math.max(0.1, Number(bed.count) || 0.35) } }],
      });
    });
    legacy.flowerFields?.forEach((field, fieldIndex) => {
      const fieldRect = importLegacyRect(field.area);
      area.children?.push({
        id: `flowerScatter${fieldIndex + 1}`,
        kind: "area",
        composition: "additive",
        shape: { type: "rectangle", center: [round((fieldRect.xMin + fieldRect.xMax) / 2), round((fieldRect.zMin + fieldRect.zMax) / 2)], size: [round(fieldRect.xMax - fieldRect.xMin), round(fieldRect.zMax - fieldRect.zMin)] },
        edgeFalloff: 0.4,
        vegetation: [{ id: `flowerLayer${fieldIndex + 1}`, type: legacyFlowerType(field.variant), distribution: defaultPerlinDistribution(0.2, fieldIndex + 11) }],
      });
    });
    legacy.cloverPatches?.forEach((patch, patchIndex) => {
      area.children?.push({
        id: `cloverPatch${patchIndex + 1}`,
        kind: "area",
        composition: "replace",
        role: "lawn",
        shape: { type: "circle", center: [Number(patch.x) || 0, Number(patch.z) || 0], radius: Number(patch.radius) || 1.5 },
        edgeFalloff: 0.6,
        vegetation: [{ id: `cloverLayer${patchIndex + 1}`, type: "clover", distribution: defaultPerlinDistribution(1, patchIndex + 21) }],
      });
    });
    if ((legacy.dandelionCount ?? 0) > 0) {
      area.children?.push({
        id: "dandelionScatter",
        kind: "area",
        composition: "additive",
        shape: area.shape,
        edgeFalloff: 0.2,
        vegetation: [{ id: "dandelionLayer", type: "dandelion", distribution: defaultPerlinDistribution(Math.min(1, (legacy.dandelionCount ?? 0) / 80), 31) }],
      });
    }
  }

  return area;
}

function legacyFlowerType(value: unknown): FoliageType {
  if (value === "blue") return "flowerBlue";
  if (value === "white") return "flowerWhite";
  if (value === "red") return "flowerRed";
  return "flowerYellow";
}

function importLegacyFence(value: unknown, index: number): Fence {
  const item = isRecord(value) ? value : {};
  return {
    id: index === 0 ? "fence" : `fence${index + 1}`,
    kind: "fence",
    height: 1,
    postSpacing: 2,
    shape: {
      type: "line",
      start: normalizePoint2(item.start, [-2, 0]),
      end: normalizePoint2(item.end, [2, 0]),
    },
  };
}
