import { pathBounds, shapeBounds, translateArea, translatePathShape, translatePoint, translateShape } from "../domain/geometry";
import { clone, defaultPack, type Area, type AreaShape, type AuthoredItem, type Distribution, type LevelV1, type MapPackV1, type PathShape, type Point2, type Rect, type Selection } from "../domain/model";
import { normalizePack } from "../domain/normalization";
import { collectAuthoredIds } from "../domain/validation";

export function round(value: number): number {
  return Number(value.toFixed(3));
}

export function currentLevel(pack: MapPackV1, selectedLevelIndex: number): LevelV1 {
  return pack.levels[selectedLevelIndex] ?? pack.levels[0] ?? clone(defaultPack.levels[0]);
}

export function pathKey(path?: number[]): string {
  return path?.join(".") ?? "";
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return a.kind === b.kind && a.index === b.index && a.vegetationIndex === b.vegetationIndex && pathKey(a.path) === pathKey(b.path);
}

export function pointLabel(point: Point2): string {
  return `${round(point[0])}, ${round(point[1])}`;
}

export function updateArray<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, currentIndex) => (currentIndex === index ? next : item));
}

export function removeArrayItem<T>(items: T[], index: number): T[] {
  return items.filter((_, currentIndex) => currentIndex !== index);
}

export function getAreaByPath(areas: Area[], path: number[] | undefined): Area | undefined {
  if (!path || path.length === 0) return undefined;
  let current: Area | undefined = areas[path[0]];
  for (const index of path.slice(1)) current = current?.children?.[index];
  return current;
}

export function updateAreasAtPath(areas: Area[], path: number[], updater: (area: Area) => Area): Area[] {
  const [head, ...tail] = path;
  return areas.map((area, index) => {
    if (index !== head) return area;
    if (tail.length === 0) return updater(area);
    return { ...area, children: updateAreasAtPath(area.children ?? [], tail, updater) };
  });
}

export function removeAreaAtPath(areas: Area[], path: number[]): Area[] {
  const [head, ...tail] = path;
  if (tail.length === 0) return removeArrayItem(areas, head);
  return areas.map((area, index) => (index === head ? { ...area, children: removeAreaAtPath(area.children ?? [], tail) } : area));
}

export function addAreaToLevel(level: LevelV1, area: Area, parentPath?: number[]): { level: LevelV1; path: number[] } {
  if (parentPath && parentPath.length > 0) {
    const parent = getAreaByPath(level.areas, parentPath);
    const nextIndex = parent?.children?.length ?? 0;
    return {
      level: { ...level, areas: updateAreasAtPath(level.areas, parentPath, (current) => ({ ...current, children: [...(current.children ?? []), area] })) },
      path: [...parentPath, nextIndex],
    };
  }
  return { level: { ...level, areas: [...level.areas, area] }, path: [level.areas.length] };
}

export function collectUniqueId(level: LevelV1, base: string): string {
  const cleaned = base.replace(/[^A-Za-z0-9]/g, "");
  const safeBase = /^[A-Za-z]/.test(cleaned) ? cleaned : `item${cleaned}`;
  const used = new Set(collectAuthoredIds(level).map((id) => id.toLowerCase()));
  if (!used.has(safeBase.toLowerCase())) return safeBase;
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${safeBase}${String(index).padStart(2, "0")}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${safeBase}${Date.now()}`;
}

export function getBounds(level: LevelV1): Rect {
  const xs = [level.spawn.position[0]];
  const zs = [level.spawn.position[1]];
  const addRect = (rect: Rect): void => {
    xs.push(rect.xMin, rect.xMax);
    zs.push(rect.zMin, rect.zMax);
  };
  const visitArea = (area: Area): void => {
    addRect(shapeBounds(area.shape));
    area.children?.forEach(visitArea);
  };
  level.areas.forEach(visitArea);
  level.roads.forEach((road) => addRect(pathBounds(road.shape)));
  level.dirtPaths.forEach((path) => addRect(pathBounds(path.shape)));
  level.fences.forEach((fence) => addRect(pathBounds(fence.shape)));
  level.terrain.heightFeatures.forEach((hill) => addRect(shapeBounds(hill.shape)));
  const pad = 4;
  return { xMin: Math.min(...xs) - pad, xMax: Math.max(...xs) + pad, zMin: Math.min(...zs) - pad, zMax: Math.max(...zs) + pad };
}

export function moveSelection(level: LevelV1, item: Selection, dx: number, dz: number): LevelV1 {
  if (dx === 0 && dz === 0) return level;
  if (item.kind === "spawn") return { ...level, spawn: { ...level.spawn, position: translatePoint(level.spawn.position, dx, dz) } };
  if (item.kind === "area" && item.path) return { ...level, areas: updateAreasAtPath(level.areas, item.path, (area) => translateArea(area, dx, dz)) };
  if (item.kind === "road" && item.index !== undefined) return { ...level, roads: updateArray(level.roads, item.index, { ...level.roads[item.index], shape: translatePathShape(level.roads[item.index].shape, dx, dz) }) };
  if (item.kind === "dirtPath" && item.index !== undefined) return { ...level, dirtPaths: updateArray(level.dirtPaths, item.index, { ...level.dirtPaths[item.index], shape: translatePathShape(level.dirtPaths[item.index].shape, dx, dz) }) };
  if (item.kind === "fence" && item.index !== undefined) return { ...level, fences: updateArray(level.fences, item.index, { ...level.fences[item.index], shape: translatePathShape(level.fences[item.index].shape, dx, dz) }) };
  if (item.kind === "heightFeature" && item.index !== undefined) {
    return { ...level, terrain: { heightFeatures: updateArray(level.terrain.heightFeatures, item.index, { ...level.terrain.heightFeatures[item.index], shape: translateShape(level.terrain.heightFeatures[item.index].shape, dx, dz) }) } };
  }
  return level;
}

export function updateCurrentLevel(pack: MapPackV1, selectedLevelIndex: number, updater: (level: LevelV1) => LevelV1): MapPackV1 {
  return normalizePack({ ...pack, levels: pack.levels.map((level, index) => (index === selectedLevelIndex ? updater(level) : level)) });
}

export function tagsText(tags?: string[]): string {
  return (tags ?? []).join(", ");
}

export function parseTags(value: string): string[] | undefined {
  const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

export function pointsText(points: Point2[]): string {
  return points.map((point) => `${point[0]}, ${point[1]}`).join("\n");
}

export function parsePoints(value: string, fallback: Point2[]): Point2[] {
  const points = value
    .split(/\n|;/)
    .map((line) => line.match(/-?\d+(?:\.\d+)?/g))
    .filter((match): match is RegExpMatchArray => Boolean(match && match.length >= 2))
    .map((match) => [round(Number(match[0])), round(Number(match[1]))] as Point2);
  return points.length >= 2 ? points : fallback;
}

export function appendPoint(points: Point2[]): Point2[] {
  const last = points.at(-1) ?? [0, 0];
  const previous = points.at(-2) ?? [last[0] - 1, last[1]];
  return [...points, [round(last[0] + (last[0] - previous[0] || 1)), round(last[1] + (last[1] - previous[1]))]];
}

export function appendCurve(shape: Extract<PathShape, { type: "cubicBezierPath" }>): { c1: Point2; c2: Point2; end: Point2 }[] {
  const last = shape.curves.at(-1);
  const start = last?.end ?? shape.start;
  return [...shape.curves, { c1: [round(start[0] + 1), start[1]], c2: [round(start[0] + 2), start[1]], end: [round(start[0] + 3), start[1]] }];
}

export function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseDistributionOctaves(value: string, fallback: Extract<Distribution, { type: "perlin" }>["noise"]["octaves"]) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)).map((item) => ({ frequency: numberValue(String(item.frequency), 0.4), weight: numberValue(String(item.weight), 1) }));
  } catch {
    return fallback;
  }
}

export function authoredFieldsPatch(item: AuthoredItem, patch: Partial<AuthoredItem>): AuthoredItem {
  return { ...item, ...patch };
}
