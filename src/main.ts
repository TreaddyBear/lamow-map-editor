import "./styles.css";
import {
  normalizeRect,
  pathBounds,
  pathPoints,
  rectFromCenter,
  shapeBounds,
  translateArea,
  translatePathShape,
  translatePoint,
  translateShape,
} from "./domain/geometry";
import { collectAuthoredIds, validateLevel } from "./domain/validation";
import {
  clone,
  defaultCoordinates,
  defaultPack,
  defaultPerlinDistribution,
  foliageRegistry,
  type Area,
  type AreaShape,
  type AuthoredItem,
  type CanvasTool,
  type CoordinateMetadata,
  type ContextMenuState,
  type DirtPath,
  type Distribution,
  type DragState,
  type Fence,
  type FoliageType,
  type HeightFeature,
  type HistoryEntry,
  type LegacyFenceSegment,
  type LegacyMapSpec,
  type LevelV1,
  type MapPackV1,
  type PathShape,
type PathTool,
type PendingPathState,
  type PerlinDistribution,
  type Point2,
  type Rect,
  type Road,
  type Selection,
  type SelectionKind,
  type Spawn,
  type Vec3,
  type VegetationLayer,
} from "./domain/model";

type EditHandleDragState = {
  selection: Selection;
  handle: string;
  index?: number;
  last: Point2;
  moved: boolean;
} | null;

let pack: MapPackV1 = clone(defaultPack);
let selectedLevelIndex = 0;
let selection: Selection = { kind: "level" };
let undoStack: HistoryEntry[] = [];
let jsonText = "";
let importMessage = "";
let canvasTool: CanvasTool = "select";
let pendingPath: PendingPathState = null;
let contextMenu: ContextMenuState = null;
let dragState: DragState = null;
let editHandleDragState: EditHandleDragState = null;
let treePanePx = 360;
let sidebarCollapsed = false;
let sidebarPanes = { tree: true, inspector: true, json: false };

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");
const appRoot = root;

function currentLevel(): LevelV1 {
  return pack.levels[selectedLevelIndex] ?? pack.levels[0] ?? clone(defaultPack.levels[0]);
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

function pathKey(path?: number[]): string {
  return path?.join(".") ?? "";
}

function parsePath(value: string | null): number[] | undefined {
  if (!value) return undefined;
  return value
    .split(".")
    .map((part) => Number(part))
    .filter((part) => Number.isInteger(part));
}

function sameSelection(a: Selection, b: Selection): boolean {
  return a.kind === b.kind && a.index === b.index && a.vegetationIndex === b.vegetationIndex && pathKey(a.path) === pathKey(b.path);
}

function pointLabel(point: Point2): string {
  return `${round(point[0])}, ${round(point[1])}`;
}

function button(id: string, text: string, className = ""): string {
  return `<button id="${id}" class="${className}" type="button">${escapeText(text)}</button>`;
}

function actionButton(text: string, onClick: () => void, className = ""): string {
  const id = crypto.randomUUID();
  queueMicrotask(() => document.getElementById(id)?.addEventListener("click", onClick));
  return button(id, text, className);
}

function disabledButton(text: string): string {
  return `<button type="button" disabled>${escapeText(text)}</button>`;
}

function field(labelText: string, value: string | number, onInput: (value: string) => void, type = "text"): string {
  const id = crypto.randomUUID();
  queueMicrotask(() => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    input?.addEventListener("change", () => onInput(input.value));
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
    });
  });
  return `<label>${escapeText(labelText)}<input id="${id}" type="${type}" value="${escapeAttr(String(value))}" /></label>`;
}

function textareaField(labelText: string, value: string, onInput: (value: string) => void): string {
  const id = crypto.randomUUID();
  queueMicrotask(() => {
    const input = document.getElementById(id) as HTMLTextAreaElement | null;
    input?.addEventListener("change", () => onInput(input.value));
  });
  return `<label>${escapeText(labelText)}<textarea id="${id}" spellcheck="false">${escapeText(value)}</textarea></label>`;
}

function selectField(labelText: string, value: string, options: { value: string; label: string }[], onInput: (value: string) => void): string {
  const id = crypto.randomUUID();
  queueMicrotask(() => {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    select?.addEventListener("input", () => onInput(select.value));
  });
  return `<label>${escapeText(labelText)}<select id="${id}">${options
    .map((option) => `<option value="${escapeAttr(option.value)}" ${option.value === value ? "selected" : ""}>${escapeText(option.label)}</option>`)
    .join("")}</select></label>`;
}

function optionalBoolField(labelText: string, value: boolean | undefined, onInput: (value: boolean | undefined) => void): string {
  return selectField(
    labelText,
    value === undefined ? "" : String(value),
    [
      { value: "", label: "role default" },
      { value: "true", label: "true" },
      { value: "false", label: "false" },
    ],
    (next) => onInput(next === "" ? undefined : next === "true"),
  );
}

function checkboxField(labelText: string, checked: boolean, onInput: (value: boolean) => void): string {
  const id = crypto.randomUUID();
  queueMicrotask(() => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    input?.addEventListener("input", () => onInput(input.checked));
  });
  return `<label class="checkbox-label"><input id="${id}" type="checkbox" ${checked ? "checked" : ""} />${escapeText(labelText)}</label>`;
}

function point2Fields(label: string, point: Point2, onChange: (point: Point2) => void): string {
  return `<div class="two">
    ${field(`${label} x`, point[0], (value) => onChange([numberValue(value, point[0]), point[1]]), "number")}
    ${field(`${label} z`, point[1], (value) => onChange([point[0], numberValue(value, point[1])]), "number")}
  </div>`;
}

function tagsText(tags?: string[]): string {
  return (tags ?? []).join(", ");
}

function parseTags(value: string): string[] | undefined {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function pushUndo(): void {
  undoStack = [...undoStack, { pack: clone(pack), selectedLevelIndex, selection: clone(selection) }].slice(-100);
}

function setPack(nextPack: MapPackV1, recordHistory = true): void {
  if (recordHistory) pushUndo();
  pack = normalizePack(nextPack);
  selectedLevelIndex = Math.min(Math.max(selectedLevelIndex, 0), Math.max(pack.levels.length - 1, 0));
  jsonText = "";
  render();
}

function updatePack(updater: (current: MapPackV1) => MapPackV1, recordHistory = true): void {
  setPack(updater(pack), recordHistory);
}

function updateLevel(updater: (level: LevelV1) => LevelV1, recordHistory = true): void {
  updatePack(
    (current) => ({
      ...current,
      levels: current.levels.map((level, index) => (index === selectedLevelIndex ? updater(level) : level)),
    }),
    recordHistory,
  );
}

function undo(): void {
  const previous = undoStack.at(-1);
  if (!previous) return;
  undoStack = undoStack.slice(0, -1);
  pack = clone(previous.pack);
  selectedLevelIndex = previous.selectedLevelIndex;
  selection = clone(previous.selection);
  jsonText = "";
  importMessage = "Undid last edit.";
  contextMenu = null;
  pendingPath = null;
  dragState = null;
  render();
}

function selectLevel(index: number): void {
  if (index === selectedLevelIndex || index < 0 || index >= pack.levels.length) return;
  pushUndo();
  selectedLevelIndex = index;
  selection = { kind: "level" };
  jsonText = "";
  importMessage = `Loaded level ${index + 1}: ${currentLevel().name}.`;
  contextMenu = null;
  pendingPath = null;
  render();
}

function selectItem(item: Selection): void {
  selection = item;
  contextMenu = null;
  render();
}

function updateArray<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function removeArrayItem<T>(items: T[], index: number): T[] {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function getAreaByPath(areas: Area[], path: number[] | undefined): Area | undefined {
  if (!path || path.length === 0) return undefined;
  const [head, ...rest] = path;
  const area = areas[head];
  if (!area) return undefined;
  return rest.length === 0 ? area : getAreaByPath(area.children ?? [], rest);
}

function updateAreasAtPath(areas: Area[], path: number[], updater: (area: Area) => Area): Area[] {
  const [head, ...rest] = path;
  return areas.map((area, index) => {
    if (index !== head) return area;
    if (rest.length === 0) return updater(area);
    return { ...area, children: updateAreasAtPath(area.children ?? [], rest, updater) };
  });
}

function removeAreaAtPath(areas: Area[], path: number[]): Area[] {
  const [head, ...rest] = path;
  if (rest.length === 0) return removeArrayItem(areas, head);
  return areas.map((area, index) => (index === head ? { ...area, children: removeAreaAtPath(area.children ?? [], rest) } : area));
}

function addAreaToLevel(area: Area, parentPath?: number[]): number[] {
  const level = currentLevel();
  if (!parentPath) {
    const nextPath = [level.areas.length];
    updateLevel((current) => ({ ...current, areas: [...current.areas, area] }));
    return nextPath;
  }

  const parent = getAreaByPath(level.areas, parentPath);
  const childIndex = parent?.children?.length ?? 0;
  updateLevel((current) => ({
    ...current,
    areas: updateAreasAtPath(current.areas, parentPath, (item) => ({ ...item, children: [...(item.children ?? []), area] })),
  }));
  return [...parentPath, childIndex];
}

function updateSelectedArea(path: number[], updater: (area: Area) => Area, recordHistory = true): void {
  updateLevel((level) => ({ ...level, areas: updateAreasAtPath(level.areas, path, updater) }), recordHistory);
}

function updateVegetation(path: number[], vegetationIndex: number, updater: (layer: VegetationLayer) => VegetationLayer): void {
  updateSelectedArea(path, (area) => ({
    ...area,
    vegetation: area.vegetation.map((layer, index) => (index === vegetationIndex ? updater(layer) : layer)),
  }));
}

function isDeletable(item: Selection): boolean {
  return item.kind === "area" || item.kind === "vegetation" || item.kind === "road" || item.kind === "dirtPath" || item.kind === "fence" || item.kind === "heightFeature";
}

function deleteSelection(item: Selection): void {
  if (!isDeletable(item)) return;
  contextMenu = null;
  selection = { kind: "level" };

  if (item.kind === "area" && item.path) {
    updateLevel((level) => ({ ...level, areas: removeAreaAtPath(level.areas, item.path!) }));
  }
  if (item.kind === "vegetation" && item.path && item.vegetationIndex !== undefined) {
    updateSelectedArea(item.path, (area) => ({ ...area, vegetation: removeArrayItem(area.vegetation, item.vegetationIndex!) }));
  }
  if (item.kind === "road" && item.index !== undefined) {
    updateLevel((level) => ({ ...level, roads: removeArrayItem(level.roads, item.index!) }));
  }
  if (item.kind === "dirtPath" && item.index !== undefined) {
    updateLevel((level) => ({ ...level, dirtPaths: removeArrayItem(level.dirtPaths, item.index!) }));
  }
  if (item.kind === "fence" && item.index !== undefined) {
    updateLevel((level) => ({ ...level, fences: removeArrayItem(level.fences, item.index!) }));
  }
  if (item.kind === "heightFeature" && item.index !== undefined) {
    updateLevel((level) => ({ ...level, terrain: { heightFeatures: removeArrayItem(level.terrain.heightFeatures, item.index!) } }));
  }
}

function duplicateSelection(item: Selection): void {
  const level = currentLevel();
  contextMenu = null;

  if (item.kind === "area" && item.path) {
    const source = getAreaByPath(level.areas, item.path);
    if (!source) return;
    const copy = translateArea({ ...clone(source), id: uniqueId(`${source.id}Copy`) }, 1, 1);
    const parentPath = item.path.slice(0, -1);
    const nextPath = addAreaToLevel(copy, parentPath.length > 0 ? parentPath : undefined);
    selection = { kind: "area", path: nextPath };
    render();
  }
  if (item.kind === "road" && item.index !== undefined) {
    const copy = { ...clone(level.roads[item.index]), id: uniqueId(`${level.roads[item.index].id}Copy`), shape: translatePathShape(level.roads[item.index].shape, 1, 1) };
    selection = { kind: "road", index: level.roads.length };
    updateLevel((current) => ({ ...current, roads: [...current.roads, copy] }));
  }
  if (item.kind === "dirtPath" && item.index !== undefined) {
    const copy = { ...clone(level.dirtPaths[item.index]), id: uniqueId(`${level.dirtPaths[item.index].id}Copy`), shape: translatePathShape(level.dirtPaths[item.index].shape, 1, 1) };
    selection = { kind: "dirtPath", index: level.dirtPaths.length };
    updateLevel((current) => ({ ...current, dirtPaths: [...current.dirtPaths, copy] }));
  }
  if (item.kind === "fence" && item.index !== undefined) {
    const copy = { ...clone(level.fences[item.index]), id: uniqueId(`${level.fences[item.index].id}Copy`), shape: translatePathShape(level.fences[item.index].shape, 1, 1) };
    selection = { kind: "fence", index: level.fences.length };
    updateLevel((current) => ({ ...current, fences: [...current.fences, copy] }));
  }
  if (item.kind === "heightFeature" && item.index !== undefined) {
    const copy = { ...clone(level.terrain.heightFeatures[item.index]), id: uniqueId(`${level.terrain.heightFeatures[item.index].id}Copy`), shape: translateShape(level.terrain.heightFeatures[item.index].shape, 1, 1) };
    selection = { kind: "heightFeature", index: level.terrain.heightFeatures.length };
    updateLevel((current) => ({ ...current, terrain: { heightFeatures: [...current.terrain.heightFeatures, copy] } }));
  }
}

function uniqueId(base: string): string {
  const cleaned = base.replace(/[^A-Za-z0-9]/g, "");
  const safeBase = /^[A-Za-z]/.test(cleaned) ? cleaned : `item${cleaned}`;
  const used = new Set(collectAuthoredIds(currentLevel()).map((id) => id.toLowerCase()));
  if (!used.has(safeBase.toLowerCase())) return safeBase;
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${safeBase}${String(index).padStart(2, "0")}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${safeBase}${Date.now()}`;
}

function exportJsonValue(): MapPackV1 {
  return normalizePack(pack);
}

function normalizePack(value: MapPackV1): MapPackV1 {
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

function normalizeLevel(level: LevelV1): LevelV1 {
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

function normalizeArea(area: Area): Area {
  return {
    ...area,
    kind: "area",
    id: area.id || "area",
    shape: normalizeAreaShape(area.shape, { type: "rectangle", center: [0, 0], size: [4, 4] }),
    vegetation: (area.vegetation ?? []).map(normalizeVegetationLayer),
    children: area.children?.map(normalizeArea),
  };
}

function normalizeVegetationLayer(layer: VegetationLayer): VegetationLayer {
  return {
    id: layer.id || "vegetation",
    type: foliageType(layer.type),
    distribution: normalizeDistribution(layer.distribution),
  };
}

function normalizeRoad(item: Road): Road {
  return { ...item, kind: "road", id: item.id || "road", width: Number(item.width) || 3.2, shape: normalizePathShape(item.shape) };
}

function normalizeDirtPath(item: DirtPath): DirtPath {
  return { ...item, kind: "dirtPath", id: item.id || "dirtPath", width: Number(item.width) || 1.1, shape: normalizePathShape(item.shape) };
}

function normalizeFence(item: Fence): Fence {
  return { ...item, kind: "fence", id: item.id || "fence", height: Number(item.height) || 1, postSpacing: item.postSpacing, shape: normalizePathShape(item.shape) };
}

function normalizeHeightFeature(item: HeightFeature): HeightFeature {
  return {
    ...item,
    type: "hill",
    id: item.id || "hill",
    shape: normalizeAreaShape(item.shape, { type: "circle", center: [0, 0], radius: 3 }),
    height: Number(item.height) || 1,
    falloff: Number(item.falloff) || 1,
  };
}

function normalizeDistribution(distribution: Distribution | unknown): Distribution {
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

function normalizePoint2(value: unknown, fallback: Point2): Point2 {
  if (Array.isArray(value) && value.length >= 2) return [round(Number(value[0]) || 0), round(Number(value[1]) || 0)];
  if (isRecord(value)) return [round(Number(value.x) || fallback[0]), round(Number(value.z) || fallback[1])];
  return fallback;
}

function normalizeAreaShape(value: unknown, fallback: AreaShape): AreaShape {
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

function normalizePathShape(value: unknown): PathShape {
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

function moveSelection(item: Selection, dx: number, dz: number): void {
  if (dx === 0 && dz === 0) return;
  if (item.kind === "spawn") {
    updateLevel((level) => ({ ...level, spawn: { ...level.spawn, position: translatePoint(level.spawn.position, dx, dz) } }), false);
  }
  if (item.kind === "area" && item.path) {
    updateSelectedArea(item.path, (area) => translateArea(area, dx, dz), false);
  }
  if (item.kind === "road" && item.index !== undefined) {
    updateLevel((level) => ({ ...level, roads: updateArray(level.roads, item.index!, { ...level.roads[item.index!], shape: translatePathShape(level.roads[item.index!].shape, dx, dz) }) }), false);
  }
  if (item.kind === "dirtPath" && item.index !== undefined) {
    updateLevel((level) => ({ ...level, dirtPaths: updateArray(level.dirtPaths, item.index!, { ...level.dirtPaths[item.index!], shape: translatePathShape(level.dirtPaths[item.index!].shape, dx, dz) }) }), false);
  }
  if (item.kind === "fence" && item.index !== undefined) {
    updateLevel((level) => ({ ...level, fences: updateArray(level.fences, item.index!, { ...level.fences[item.index!], shape: translatePathShape(level.fences[item.index!].shape, dx, dz) }) }), false);
  }
  if (item.kind === "heightFeature" && item.index !== undefined) {
    updateLevel((level) => ({
      ...level,
      terrain: {
        heightFeatures: updateArray(level.terrain.heightFeatures, item.index!, {
          ...level.terrain.heightFeatures[item.index!],
          shape: translateShape(level.terrain.heightFeatures[item.index!].shape, dx, dz),
        }),
      },
    }), false);
  }
}

function moveEditHandle(item: Selection, handle: string, index: number | undefined, world: Point2, dx: number, dz: number): void {
  if (item.kind === "spawn") {
    updateLevel((level) => {
      const [x, z] = level.spawn.position;
      const headingDegrees = Math.atan2(world[1] - z, world[0] - x) * (180 / Math.PI);
      return { ...level, spawn: { ...level.spawn, headingDegrees: round(headingDegrees) } };
    }, false);
  }
  if (item.kind === "area" && item.path) {
    updateSelectedArea(item.path, (area) => ({ ...area, shape: moveAreaShapeHandle(area.shape, handle, index, world, dx, dz) }), false);
  }
  if (item.kind === "heightFeature" && item.index !== undefined) {
    updateLevel((level) => ({
      ...level,
      terrain: {
        heightFeatures: updateArray(level.terrain.heightFeatures, item.index!, {
          ...level.terrain.heightFeatures[item.index!],
          shape: moveAreaShapeHandle(level.terrain.heightFeatures[item.index!].shape, handle, index, world, dx, dz),
        }),
      },
    }), false);
  }
  if ((item.kind === "road" || item.kind === "dirtPath") && item.index !== undefined) {
    const key = item.kind === "road" ? "roads" : "dirtPaths";
    updateLevel((level) => {
      const items = level[key];
      return { ...level, [key]: updateArray(items, item.index!, { ...items[item.index!], shape: movePathShapeHandle(items[item.index!].shape, handle, index, world, dx, dz) }) } as LevelV1;
    }, false);
  }
  if (item.kind === "fence" && item.index !== undefined) {
    updateLevel((level) => ({
      ...level,
      fences: updateArray(level.fences, item.index!, { ...level.fences[item.index!], shape: movePathShapeHandle(level.fences[item.index!].shape, handle, index, world, dx, dz) }),
    }), false);
  }
}

function moveAreaShapeHandle(shape: AreaShape, handle: string, index: number | undefined, world: Point2, dx: number, dz: number): AreaShape {
  if (shape.type === "circle") {
    if (handle === "center") return { ...shape, center: translatePoint(shape.center, dx, dz) };
    if (handle === "radius") {
      const radius = Math.max(0.1, Math.hypot(world[0] - shape.center[0], world[1] - shape.center[1]));
      return { ...shape, radius: round(radius) };
    }
  }
  if (shape.type === "rectangle") {
    if (handle === "center") return { ...shape, center: translatePoint(shape.center, dx, dz) };
    if (handle === "corner") {
      return { ...shape, size: [Math.max(0.1, round(Math.abs(world[0] - shape.center[0]) * 2)), Math.max(0.1, round(Math.abs(world[1] - shape.center[1]) * 2))] };
    }
  }
  if (shape.type === "polygon" && handle === "vertex" && index !== undefined) {
    return { ...shape, points: updateArray(shape.points, index, [round(world[0]), round(world[1])]) };
  }
  return shape;
}

function movePathShapeHandle(shape: PathShape, handle: string, index: number | undefined, world: Point2, dx: number, dz: number): PathShape {
  const point: Point2 = [round(world[0]), round(world[1])];
  if (shape.type === "line") {
    if (handle === "start") return { ...shape, start: point };
    if (handle === "end") return { ...shape, end: point };
  }
  if (shape.type === "polyline" && handle === "vertex" && index !== undefined) {
    return { ...shape, points: updateArray(shape.points, index, point) };
  }
  if (shape.type === "cubicBezierPath") {
    if (handle === "start") return { ...shape, start: point };
    if (index === undefined) return shape;
    const curveIndex = Math.floor(index / 3);
    const key = ["c1", "c2", "end"][index % 3] as "c1" | "c2" | "end";
    return { ...shape, curves: updateArray(shape.curves, curveIndex, { ...shape.curves[curveIndex], [key]: point }) };
  }
  return translatePathShape(shape, dx, dz);
}

function renderLevelSelector(): string {
  const id = "level-select";
  queueMicrotask(() => {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    select?.addEventListener("change", () => selectLevel(Number(select.value)));
  });
  return `<div class="level-row">
    <label for="${id}">Level</label>
    <select id="${id}" class="compact-select">
      ${pack.levels
        .map((level, index) => `<option value="${index}" ${index === selectedLevelIndex ? "selected" : ""}>${index + 1}. ${escapeText(level.name)} (${escapeText(level.code)})</option>`)
        .join("")}
    </select>
    ${button("add-level", "+")}
  </div>`;
}

function treeAttrs(item: Selection, prefix: "tree" | "delete" | "select"): string {
  const attrs = [`data-${prefix}-kind="${item.kind}"`];
  if (item.path) attrs.push(`data-${prefix}-path="${pathKey(item.path)}"`);
  if (item.index !== undefined) attrs.push(`data-${prefix}-index="${item.index}"`);
  if (item.vegetationIndex !== undefined) attrs.push(`data-${prefix}-vegetation-index="${item.vegetationIndex}"`);
  return attrs.join(" ");
}

function selectionId(item: Selection): string {
  return `${item.kind}-${pathKey(item.path)}-${item.index ?? ""}-${item.vegetationIndex ?? ""}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

function treeButton(item: Selection, icon: string, label: string, depth = 0): string {
  const active = sameSelection(selection, item) ? "active" : "";
  return `<div class="tree-row ${active}" style="--depth: ${depth}">
    <button id="tree-${selectionId(item)}" ${treeAttrs(item, "tree")} class="tree-item" type="button"><span class="tree-icon">${escapeText(icon)}</span><span>${escapeText(label)}</span></button>
    ${isDeletable(item) ? `<button id="delete-${selectionId(item)}" ${treeAttrs(item, "delete")} class="tree-delete danger" type="button" title="Delete">x</button>` : ""}
  </div>`;
}

function treeFolder(label: string, addId: string | null, depth = 0): string {
  return `<div class="tree-folder" style="--depth: ${depth}"><span>v</span><span>${escapeText(label)}</span>${addId ? button(addId, "+") : ""}</div>`;
}

function renderObjectTree(): string {
  const level = currentLevel();
  return `<div class="tree">
    ${treeButton({ kind: "level" }, "[L]", `${level.name} / ${level.code}`, 0)}
    ${treeButton({ kind: "spawn" }, "[S]", `spawn (${pointLabel(level.spawn.position)})`, 1)}
    ${treeFolder("areas", "add-area-root", 1)}
    ${level.areas.map((area, index) => renderAreaTree(area, [index], 2)).join("")}
    ${treeFolder("roads", "add-road", 1)}
    ${level.roads.map((road, index) => treeButton({ kind: "road", index }, "[R]", `${road.id} (${road.width}m)`, 2)).join("")}
    ${treeFolder("dirt paths", "add-dirt-path", 1)}
    ${level.dirtPaths.map((path, index) => treeButton({ kind: "dirtPath", index }, "[P]", `${path.id} (${path.width}m)`, 2)).join("")}
    ${treeFolder("fences", "add-fence", 1)}
    ${level.fences.map((fence, index) => treeButton({ kind: "fence", index }, "[F]", `${fence.id} (${fence.height}m)`, 2)).join("")}
    ${treeFolder("terrain", "add-hill", 1)}
    ${level.terrain.heightFeatures.map((hill, index) => treeButton({ kind: "heightFeature", index }, "[H]", `${hill.id} (${hill.height}m)`, 2)).join("")}
    ${treeButton({ kind: "objects" }, "[O]", `objects (${level.objects.length})`, 1)}
  </div>`;
}

function renderAreaTree(area: Area, path: number[], depth: number): string {
  const role = area.role ? ` ${area.role}` : "";
  const composition = area.composition === "additive" ? " additive" : "";
  const shape = area.shape.type;
  return `${treeButton({ kind: "area", path }, "[A]", `${area.id}${role}${composition} (${shape})`, depth)}
    ${area.vegetation.map((layer, index) => treeButton({ kind: "vegetation", path, vegetationIndex: index }, "[V]", `${layer.id}: ${layer.type}`, depth + 1)).join("")}
    ${(area.children ?? []).map((child, index) => renderAreaTree(child, [...path, index], depth + 1)).join("")}`;
}

function toolButton(tool: CanvasTool, text: string): string {
  return `<button id="tool-${tool}" class="${canvasTool === tool ? "primary" : ""}" type="button">${escapeText(text)}</button>`;
}

function renderInspector(): string {
  const level = currentLevel();

  if (selection.kind === "level") return renderLevelInspector(level);
  if (selection.kind === "spawn") return renderSpawnInspector(level);
  if (selection.kind === "area" && selection.path) return renderAreaInspector(level, selection.path);
  if (selection.kind === "vegetation" && selection.path && selection.vegetationIndex !== undefined) return renderVegetationInspector(level, selection.path, selection.vegetationIndex);
  if (selection.kind === "road" && selection.index !== undefined && level.roads[selection.index]) return renderPathItemInspector("road", level.roads[selection.index], selection.index);
  if (selection.kind === "dirtPath" && selection.index !== undefined && level.dirtPaths[selection.index]) return renderPathItemInspector("dirtPath", level.dirtPaths[selection.index], selection.index);
  if (selection.kind === "fence" && selection.index !== undefined && level.fences[selection.index]) return renderFenceInspector(level.fences[selection.index], selection.index);
  if (selection.kind === "heightFeature" && selection.index !== undefined && level.terrain.heightFeatures[selection.index]) return renderHeightFeatureInspector(level.terrain.heightFeatures[selection.index], selection.index);
  if (selection.kind === "objects") return renderObjectsInspector(level);

  return `<div class="section"><div class="hint">Select an object to edit its properties.</div></div>`;
}

function renderLevelInspector(level: LevelV1): string {
  return `<div class="section">
    <div class="section-title"><h3>Level properties</h3></div>
    <div class="stack">
      <div class="two">
        ${field("Pack prefix", pack.pack.prefix, (value) => updatePack((current) => ({ ...current, pack: { ...current.pack, prefix: value } })))}
        ${field("Pack name", pack.pack.name, (value) => updatePack((current) => ({ ...current, pack: { ...current.pack, name: value } })))}
      </div>
      <div class="two">
        ${field("Code", level.code, (value) => updateLevel((current) => ({ ...current, code: value })))}
        ${field("Name", level.name, (value) => updateLevel((current) => ({ ...current, name: value })))}
      </div>
      <div class="two">
        ${field("Par seconds", level.parSeconds, (value) => updateLevel((current) => ({ ...current, parSeconds: numberValue(value, current.parSeconds) })), "number")}
        ${field("Tags", tagsText(level.tags), (value) => updateLevel((current) => ({ ...current, tags: parseTags(value) })))}
      </div>
    </div>
  </div>`;
}

function renderSpawnInspector(level: LevelV1): string {
  return `<div class="section">
    <div class="section-title"><h3>Spawn</h3></div>
    <div class="stack">
      ${point2Fields("position", level.spawn.position, (position) => updateLevel((current) => ({ ...current, spawn: { ...current.spawn, position } })))}
      ${field("heading degrees", level.spawn.headingDegrees, (value) => updateLevel((current) => ({ ...current, spawn: { ...current.spawn, headingDegrees: numberValue(value, current.spawn.headingDegrees) } })), "number")}
    </div>
  </div>`;
}

function renderAuthoredFields(item: AuthoredItem, onChange: (item: AuthoredItem) => void): string {
  return `<div class="stack">
    <div class="two">
      ${field("id", item.id, (value) => onChange({ ...item, id: value }))}
      ${field("name", item.name ?? "", (value) => onChange({ ...item, name: value || undefined }))}
    </div>
    <div class="two">
      ${field("tags", tagsText(item.tags), (value) => onChange({ ...item, tags: parseTags(value) }))}
      ${field("editor layer", item.editor?.layer ?? "", (value) => onChange({ ...item, editor: { ...(item.editor ?? {}), layer: value || undefined } }))}
    </div>
    ${checkboxField("editor locked", item.editor?.locked ?? false, (locked) => onChange({ ...item, editor: { ...(item.editor ?? {}), locked } }))}
  </div>`;
}

function renderAreaInspector(level: LevelV1, path: number[]): string {
  const area = getAreaByPath(level.areas, path);
  if (!area) return `<div class="section"><div class="hint">Area not found.</div></div>`;

  return `<div class="section">
    <div class="section-title"><h3>Area ${escapeText(area.id)}</h3>${button("delete-selected", "Delete", "danger")}</div>
    <div class="stack">
      ${renderAuthoredFields(area, (next) => updateSelectedArea(path, (current) => ({ ...current, ...next })))}
      <div class="two">
        ${selectField("composition", area.composition ?? "replace", [{ value: "replace", label: "replace" }, { value: "additive", label: "additive" }], (value) => updateSelectedArea(path, (current) => ({ ...current, composition: value as Area["composition"] })))}
        ${selectField("role", area.role ?? "", [{ value: "", label: "none" }, { value: "background", label: "background" }, { value: "lawn", label: "lawn" }, { value: "bed", label: "bed" }], (value) => updateSelectedArea(path, (current) => ({ ...current, role: (value || undefined) as Area["role"] })))}
      </div>
      <div class="two">
        ${selectField("surface", area.surface ?? "", [{ value: "", label: "role default" }, { value: "grass", label: "grass" }, { value: "dirt", label: "dirt" }], (value) => updateSelectedArea(path, (current) => ({ ...current, surface: (value || undefined) as Area["surface"] })))}
        ${optionalBoolField("mowable", area.mowable, (value) => updateSelectedArea(path, (current) => ({ ...current, mowable: value })))}
      </div>
      ${field("edge falloff", area.edgeFalloff ?? "", (value) => updateSelectedArea(path, (current) => ({ ...current, edgeFalloff: value.trim() === "" ? undefined : numberValue(value, current.edgeFalloff ?? 0) })), "number")}
      ${renderAreaShapeFields(area.shape, (shape) => updateSelectedArea(path, (current) => ({ ...current, shape })))}
      <div class="json-actions">
        ${button("add-child-area", "Add child area")}
        ${button("add-vegetation", "Add vegetation")}
      </div>
    </div>
  </div>`;
}

function renderVegetationInspector(level: LevelV1, path: number[], vegetationIndex: number): string {
  const area = getAreaByPath(level.areas, path);
  const layer = area?.vegetation[vegetationIndex];
  if (!area || !layer) return `<div class="section"><div class="hint">Vegetation layer not found.</div></div>`;

  return `<div class="section">
    <div class="section-title"><h3>Vegetation ${escapeText(layer.id)}</h3>${button("delete-selected", "Delete", "danger")}</div>
    <div class="stack">
      <div class="two">
        ${field("id", layer.id, (value) => updateVegetation(path, vegetationIndex, (current) => ({ ...current, id: value })))}
        ${selectField("type", layer.type, foliageRegistry.map((entry) => ({ value: entry.key, label: `${entry.label} (${entry.category})` })), (value) => updateVegetation(path, vegetationIndex, (current) => ({ ...current, type: value as FoliageType })))}
      </div>
      ${renderDistributionFields(layer.distribution, (distribution) => updateVegetation(path, vegetationIndex, (current) => ({ ...current, distribution })))}
    </div>
  </div>`;
}

function renderDistributionFields(distribution: Distribution, onChange: (distribution: Distribution) => void): string {
  const typeOptions = [{ value: "uniform", label: "uniform" }, { value: "perlin", label: "perlin" }];
  const typeField = selectField("distribution", distribution.type, typeOptions, (value) => {
    onChange(value === "perlin" ? defaultPerlinDistribution(distribution.density, 1) : { type: "uniform", density: distribution.density });
  });

  if (distribution.type === "uniform") {
    return `<div class="stack">${typeField}${field("density", distribution.density, (value) => onChange({ ...distribution, density: numberValue(value, distribution.density) }), "number")}</div>`;
  }

  return `<div class="stack">
    ${typeField}
    <div class="two">
      ${field("density", distribution.density, (value) => onChange({ ...distribution, density: numberValue(value, distribution.density) }), "number")}
      ${field("seed", distribution.noise.seed, (value) => onChange({ ...distribution, noise: { ...distribution.noise, seed: numberValue(value, distribution.noise.seed) } }), "number")}
    </div>
    <div class="two">
      ${field("domain warp", distribution.noise.domainWarp ?? "", (value) => onChange({ ...distribution, noise: { ...distribution.noise, domainWarp: value.trim() === "" ? undefined : numberValue(value, distribution.noise.domainWarp ?? 0) } }), "number")}
      ${field("threshold", distribution.noise.threshold, (value) => onChange({ ...distribution, noise: { ...distribution.noise, threshold: numberValue(value, distribution.noise.threshold) } }), "number")}
    </div>
    ${field("softness", distribution.noise.softness, (value) => onChange({ ...distribution, noise: { ...distribution.noise, softness: numberValue(value, distribution.noise.softness) } }), "number")}
    ${textareaField("octaves JSON", JSON.stringify(distribution.noise.octaves), (value) => onChange({ ...distribution, noise: { ...distribution.noise, octaves: parseOctaves(value, distribution.noise.octaves) } }))}
  </div>`;
}

function parseOctaves(value: string, fallback: { frequency: number; weight: number }[]): { frequency: number; weight: number }[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const octaves = parsed.filter(isRecord).map((item) => ({ frequency: finiteNumber(item.frequency, 0.4), weight: finiteNumber(item.weight, 1) }));
    return octaves.length > 0 ? octaves : fallback;
  } catch {
    return fallback;
  }
}

function renderAreaShapeFields(shape: AreaShape, onChange: (shape: AreaShape) => void): string {
  const typeField = selectField(
    "shape",
    shape.type,
    [
      { value: "rectangle", label: "rectangle" },
      { value: "circle", label: "circle" },
      { value: "polygon", label: "polygon" },
    ],
    (value) => onChange(convertAreaShape(shape, value as AreaShape["type"])),
  );

  if (shape.type === "circle") {
    return `<div class="stack">${typeField}${point2Fields("center", shape.center, (center) => onChange({ ...shape, center }))}${field("radius", shape.radius, (value) => onChange({ ...shape, radius: numberValue(value, shape.radius) }), "number")}</div>`;
  }
  if (shape.type === "polygon") {
    return `<div class="stack">
      ${typeField}
      <div class="json-actions">
        ${actionButton("Add vertex", () => onChange({ ...shape, points: appendPoint(shape.points) }))}
        ${shape.points.length > 3 ? actionButton("Remove last", () => onChange({ ...shape, points: shape.points.slice(0, -1) }), "danger") : disabledButton("Remove last")}
      </div>
      ${textareaField("points", pointsText(shape.points), (value) => onChange({ ...shape, points: parsePoints(value, shape.points) }))}
    </div>`;
  }
  return `<div class="stack">
    ${typeField}
    ${point2Fields("center", shape.center, (center) => onChange({ ...shape, center }))}
    ${point2Fields("size", shape.size, (size) => onChange({ ...shape, size }))}
    ${field("rotation degrees", shape.rotationDegrees ?? 0, (value) => onChange({ ...shape, rotationDegrees: numberValue(value, shape.rotationDegrees ?? 0) }), "number")}
  </div>`;
}

function convertAreaShape(shape: AreaShape, type: AreaShape["type"]): AreaShape {
  const bounds = shapeBounds(shape);
  const center: Point2 = [round((bounds.xMin + bounds.xMax) / 2), round((bounds.zMin + bounds.zMax) / 2)];
  const size: Point2 = [round(bounds.xMax - bounds.xMin), round(bounds.zMax - bounds.zMin)];
  if (type === "circle") return { type: "circle", center, radius: round(Math.max(size[0], size[1]) / 2) || 1 };
  if (type === "polygon") return { type: "polygon", points: [[bounds.xMin, bounds.zMin], [bounds.xMax, bounds.zMin], [bounds.xMax, bounds.zMax], [bounds.xMin, bounds.zMax]].map((point) => [round(point[0]), round(point[1])] as Point2) };
  return { type: "rectangle", center, size };
}

function pointsText(points: Point2[]): string {
  return points.map((point) => `${point[0]}, ${point[1]}`).join("\n");
}

function parsePoints(value: string, fallback: Point2[]): Point2[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const points = parsed.map((point) => normalizePoint2(point, [0, 0]));
      return points.length >= 2 ? points : fallback;
    }
  } catch {
    // Try line-oriented points below.
  }
  const points = value
    .split(/\n|;/)
    .map((line) => line.match(/-?\d+(?:\.\d+)?/g))
    .filter((match): match is RegExpMatchArray => Boolean(match && match.length >= 2))
    .map((match) => [round(Number(match[0])), round(Number(match[1]))] as Point2);
  return points.length >= 2 ? points : fallback;
}

function appendPoint(points: Point2[]): Point2[] {
  const last = points.at(-1) ?? [0, 0];
  const previous = points.at(-2) ?? [last[0] - 1, last[1]];
  return [...points, [round(last[0] + (last[0] - previous[0] || 1)), round(last[1] + (last[1] - previous[1]))]];
}

function renderPathItemInspector(kind: "road" | "dirtPath", item: Road | DirtPath, index: number): string {
  return `<div class="section">
    <div class="section-title"><h3>${kind === "road" ? "Road" : "Dirt path"} ${escapeText(item.id)}</h3>${button("delete-selected", "Delete", "danger")}</div>
    <div class="stack">
      ${renderAuthoredFields(item, (next) => updateLevel((level) => ({ ...level, [kind === "road" ? "roads" : "dirtPaths"]: updateArray(kind === "road" ? level.roads : level.dirtPaths, index, { ...item, ...next }) } as LevelV1)))}
      ${field("width", item.width, (value) => updateLevel((level) => ({ ...level, [kind === "road" ? "roads" : "dirtPaths"]: updateArray(kind === "road" ? level.roads : level.dirtPaths, index, { ...item, width: numberValue(value, item.width) }) } as LevelV1)), "number")}
      ${renderPathShapeFields(item.shape, (shape) => updateLevel((level) => ({ ...level, [kind === "road" ? "roads" : "dirtPaths"]: updateArray(kind === "road" ? level.roads : level.dirtPaths, index, { ...item, shape }) } as LevelV1)))}
    </div>
  </div>`;
}

function renderFenceInspector(item: Fence, index: number): string {
  return `<div class="section">
    <div class="section-title"><h3>Fence ${escapeText(item.id)}</h3>${button("delete-selected", "Delete", "danger")}</div>
    <div class="stack">
      ${renderAuthoredFields(item, (next) => updateLevel((level) => ({ ...level, fences: updateArray(level.fences, index, { ...item, ...next }) })))}
      <div class="two">
        ${field("height", item.height, (value) => updateLevel((level) => ({ ...level, fences: updateArray(level.fences, index, { ...item, height: numberValue(value, item.height) }) })), "number")}
        ${field("post spacing", item.postSpacing ?? "", (value) => updateLevel((level) => ({ ...level, fences: updateArray(level.fences, index, { ...item, postSpacing: value.trim() === "" ? undefined : numberValue(value, item.postSpacing ?? 2) }) })), "number")}
      </div>
      ${renderPathShapeFields(item.shape, (shape) => updateLevel((level) => ({ ...level, fences: updateArray(level.fences, index, { ...item, shape }) })))}
    </div>
  </div>`;
}

function renderPathShapeFields(shape: PathShape, onChange: (shape: PathShape) => void): string {
  const typeField = selectField(
    "shape",
    shape.type,
    [
      { value: "line", label: "line" },
      { value: "polyline", label: "polyline" },
      { value: "cubicBezierPath", label: "cubicBezierPath" },
    ],
    (value) => onChange(convertPathShape(shape, value as PathShape["type"])),
  );

  if (shape.type === "polyline") {
    return `<div class="stack">
      ${typeField}
      <div class="json-actions">
        ${actionButton("Add point", () => onChange({ ...shape, points: appendPoint(shape.points) }))}
        ${shape.points.length > 2 ? actionButton("Remove last", () => onChange({ ...shape, points: shape.points.slice(0, -1) }), "danger") : disabledButton("Remove last")}
      </div>
      ${textareaField("points", pointsText(shape.points), (value) => onChange({ ...shape, points: parsePoints(value, shape.points) }))}
    </div>`;
  }
  if (shape.type === "cubicBezierPath") {
    return `<div class="stack">
      ${typeField}
      ${point2Fields("start", shape.start, (start) => onChange({ ...shape, start }))}
      <div class="json-actions">
        ${actionButton("Add curve", () => onChange({ ...shape, curves: appendCurve(shape) }))}
        ${shape.curves.length > 1 ? actionButton("Remove last", () => onChange({ ...shape, curves: shape.curves.slice(0, -1) }), "danger") : disabledButton("Remove last")}
      </div>
      ${textareaField("curves JSON", JSON.stringify(shape.curves), (value) => onChange({ ...shape, curves: parseCurves(value, shape.curves) }))}
    </div>`;
  }
  return `<div class="stack">${typeField}${point2Fields("start", shape.start, (start) => onChange({ ...shape, start }))}${point2Fields("end", shape.end, (end) => onChange({ ...shape, end }))}</div>`;
}

function convertPathShape(shape: PathShape, type: PathShape["type"]): PathShape {
  const points = pathPoints(shape);
  const start = points[0] ?? [0, 0];
  const end = points.at(-1) ?? [2, 0];
  if (type === "polyline") return { type: "polyline", points: points.length >= 2 ? points : [start, end] };
  if (type === "cubicBezierPath") return { type: "cubicBezierPath", start, curves: [{ c1: start, c2: end, end }] };
  return { type: "line", start, end };
}

function appendCurve(shape: Extract<PathShape, { type: "cubicBezierPath" }>): { c1: Point2; c2: Point2; end: Point2 }[] {
  const last = shape.curves.at(-1);
  const start = last?.end ?? shape.start;
  const c1: Point2 = [round(start[0] + 1), start[1]];
  const c2: Point2 = [round(start[0] + 2), start[1]];
  const end: Point2 = [round(start[0] + 3), start[1]];
  return [...shape.curves, { c1, c2, end }];
}

function parseCurves(value: string, fallback: { c1: Point2; c2: Point2; end: Point2 }[]): { c1: Point2; c2: Point2; end: Point2 }[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter(isRecord).map((curve) => ({ c1: normalizePoint2(curve.c1, [0, 0]), c2: normalizePoint2(curve.c2, [0, 0]), end: normalizePoint2(curve.end, [0, 0]) }));
  } catch {
    return fallback;
  }
}

function renderHeightFeatureInspector(item: HeightFeature, index: number): string {
  return `<div class="section">
    <div class="section-title"><h3>Hill ${escapeText(item.id)}</h3>${button("delete-selected", "Delete", "danger")}</div>
    <div class="stack">
      ${renderAuthoredFields(item, (next) => updateLevel((level) => ({ ...level, terrain: { heightFeatures: updateArray(level.terrain.heightFeatures, index, { ...item, ...next }) } })))}
      <div class="two">
        ${field("height", item.height, (value) => updateLevel((level) => ({ ...level, terrain: { heightFeatures: updateArray(level.terrain.heightFeatures, index, { ...item, height: numberValue(value, item.height) }) } })), "number")}
        ${field("falloff", item.falloff, (value) => updateLevel((level) => ({ ...level, terrain: { heightFeatures: updateArray(level.terrain.heightFeatures, index, { ...item, falloff: numberValue(value, item.falloff) }) } })), "number")}
      </div>
      ${renderAreaShapeFields(item.shape, (shape) => updateLevel((level) => ({ ...level, terrain: { heightFeatures: updateArray(level.terrain.heightFeatures, index, { ...item, shape }) } })))}
    </div>
  </div>`;
}

function renderObjectsInspector(level: LevelV1): string {
  return `<div class="section">
    <div class="section-title"><h3>Objects placeholder</h3></div>
    <div class="stack">
      <div class="hint">The v1 draft reserves this array, but object entries are not defined yet. Keep it empty unless the spec changes.</div>
      ${textareaField("objects JSON", JSON.stringify(level.objects, null, 2), (value) => updateLevel((current) => ({ ...current, objects: parseObjects(value, current.objects) })))}
    </div>
  </div>`;
}

function parseObjects(value: string, fallback: unknown[]): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function renderContextMenu(): string {
  if (!contextMenu) return "";
  const target = contextMenu.target;
  const areaTarget = target?.kind === "area" ? target.path : selection.kind === "area" ? selection.path : undefined;
  return `<div id="context-menu" class="context-menu" style="left: ${contextMenu.screenX}px; top: ${contextMenu.screenY}px;">
    ${target ? `<button id="ctx-select-target" type="button">Select ${escapeText(contextLabel(target))}</button>` : ""}
    ${target && isDeletable(target) ? `<button id="ctx-duplicate-target" type="button">Duplicate ${escapeText(contextLabel(target))}</button>` : ""}
    ${target && isDeletable(target) ? `<button id="ctx-delete-target" class="danger" type="button">Delete ${escapeText(contextLabel(target))}</button>` : ""}
    ${target ? `<div class="context-divider"></div>` : ""}
    <button id="ctx-move-spawn" type="button">Move spawn to crosshair</button>
    <details class="context-submenu" open>
      <summary>Add</summary>
      <button id="ctx-add-area" type="button">Lawn area here</button>
      <button id="ctx-add-child-area" type="button">${areaTarget ? "Child area here" : "Area here"}</button>
      <button id="ctx-add-clover" type="button">Clover patch here</button>
      <button id="ctx-add-flowers" type="button">Flower scatter here</button>
      <button id="ctx-add-bed" type="button">Bed here</button>
      <button id="ctx-add-fence-start" type="button">${pendingPath?.kind === "fence" ? "Finish fence at crosshair" : "Start fence at crosshair"}</button>
      <button id="ctx-add-road" type="button">Short road here</button>
      <button id="ctx-add-dirt-path" type="button">Short dirt path here</button>
      <button id="ctx-add-hill" type="button">Hill here</button>
    </details>
  </div>`;
}

function contextLabel(item: Selection): string {
  if (item.kind === "spawn") return "spawn";
  if (item.kind === "area") return `area ${pathKey(item.path)}`;
  if (item.kind === "vegetation") return `vegetation ${item.vegetationIndex! + 1}`;
  if (item.kind === "road") return `road ${item.index! + 1}`;
  if (item.kind === "dirtPath") return `dirt path ${item.index! + 1}`;
  if (item.kind === "fence") return `fence ${item.index! + 1}`;
  if (item.kind === "heightFeature") return `hill ${item.index! + 1}`;
  if (item.kind === "objects") return "objects";
  return "level";
}

function selectionFromAttributes(element: Element, prefix: "tree" | "delete" | "select"): Selection | null {
  const kind = element.getAttribute(`data-${prefix}-kind`) as SelectionKind | null;
  if (!kind) return null;
  const path = parsePath(element.getAttribute(`data-${prefix}-path`));
  const indexText = element.getAttribute(`data-${prefix}-index`);
  const vegetationText = element.getAttribute(`data-${prefix}-vegetation-index`);
  return {
    kind,
    path,
    index: indexText === null || indexText === "" ? undefined : Number(indexText),
    vegetationIndex: vegetationText === null || vegetationText === "" ? undefined : Number(vegetationText),
  };
}

function eventToWorld(svg: SVGSVGElement, event: MouseEvent | PointerEvent): Point2 | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(ctm.inverse());
  return [round(local.x), round(local.y)];
}

function getBounds(level: LevelV1): Rect {
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
  return {
    xMin: Math.min(...xs) - pad,
    xMax: Math.max(...xs) + pad,
    zMin: Math.min(...zs) - pad,
    zMax: Math.max(...zs) + pad,
  };
}

function render(): void {
  const level = currentLevel();
  const validation = validateLevel(pack, level);
  const bounds = getBounds(level);
  const exportValue = exportJsonValue();
  const allSidebarPanesCollapsed = !sidebarPanes.tree && !sidebarPanes.inspector && !sidebarPanes.json;
  const isSidebarCollapsed = sidebarCollapsed || allSidebarPanesCollapsed;

  appRoot.innerHTML = `
    <main class="app ${isSidebarCollapsed ? "sidebar-is-collapsed" : ""}">
      <aside class="panel sidebar-panel ${isSidebarCollapsed ? "collapsed" : ""}">
        <div class="panel-header">
          <h1>LaMow Map Editor</h1>
          <div class="json-actions">
            ${button("toggle-sidebar", isSidebarCollapsed ? "Show" : "Hide")}
            ${undoStack.length > 0 ? button("undo-edit", "Undo") : disabledButton("Undo")}
            ${button("reset-map", "Reset")}
          </div>
        </div>
        <div class="editor-sidebar">
          <details id="sidebar-pane-tree" class="sidebar-pane" ${sidebarPanes.tree ? "open" : ""}>
            <summary>Map</summary>
            <div class="tree-pane">
              ${renderLevelSelector()}
              ${renderObjectTree()}
            </div>
          </details>
          <details id="sidebar-pane-inspector" class="sidebar-pane" ${sidebarPanes.inspector ? "open" : ""}>
            <summary>Inspector</summary>
            <div class="inspector-pane">
              ${renderInspector()}
            </div>
          </details>
          <details id="sidebar-pane-json" class="sidebar-pane" ${sidebarPanes.json ? "open" : ""}>
            <summary>Import / Export</summary>
            <div class="panel-body stack">
              <div class="json-actions">
                ${button("copy-json", "Copy", "primary")}
                ${button("open-json-file", "Open file")}
                ${button("read-clipboard", "Import clipboard")}
                ${button("load-json", "Import")}
              </div>
              <input id="json-file-input" type="file" accept="application/json,.json,.txt,text/plain" hidden />
              <div id="json-drop-zone" class="drop-zone">
                <strong>Drop a JSON file here</strong>
                <span>Use this when paste cuts off large map bundles.</span>
              </div>
              <textarea id="json-output" spellcheck="false">${escapeText(jsonText || JSON.stringify(exportValue, null, 2))}</textarea>
              ${importMessage ? `<div class="${importMessage.startsWith("Imported") || importMessage.startsWith("Copied") ? "ok" : "error"}">${escapeText(importMessage)}</div>` : ""}
              <div class="hint">Import accepts the draft v1 pack shape, a single v1 level, or old prototype map JSON. Export is always the draft v1 pack shape.</div>
            </div>
          </details>
        </div>
      </aside>

      <section class="panel canvas-panel">
        <div class="panel-header">
          <h2>Top-down preview</h2>
          <div class="json-actions">
            ${toolButton("select", "Select")}
            ${toolButton("spawn", "Spawn")}
            ${toolButton("area", "Area")}
            ${toolButton("fence", pendingPath?.kind === "fence" ? "Fence end" : "Fence")}
            ${toolButton("road", pendingPath?.kind === "road" ? "Road end" : "Road")}
            ${toolButton("dirtPath", pendingPath?.kind === "dirtPath" ? "Path end" : "Path")}
            ${toolButton("hill", "Hill")}
          </div>
        </div>
        <div class="map-wrap">
          ${renderSvg(level, bounds)}
        </div>
        <div class="status">
          <div class="hint">${escapeText(canvasHint())}</div>
          ${validation.length === 0 ? `<div class="ok">Draft v1 shape validates for the checks currently implemented.</div>` : validation.map((error) => `<div class="error">${escapeText(error)}</div>`).join("")}
        </div>
      </section>

      ${renderContextMenu()}
    </main>
  `;

  wireGlobalActions();
}

function canvasHint(): string {
  if (canvasTool === "spawn") return "Spawn tool: click the preview to place the spawn point.";
  if (canvasTool === "area") return "Area tool: click to add a lawn area. If an area is selected, the new area becomes its child.";
  if (canvasTool === "hill") return "Hill tool: click to add a terrain hill.";
  if (pendingPath) return `${pendingPath.kind} tool: click to finish the line.`;
  if (canvasTool === "fence" || canvasTool === "road" || canvasTool === "dirtPath") return `${canvasTool} tool: click once to start a line, then click again to finish it.`;
  return "Select tool: click or drag objects in the preview. Right-click for precise crosshair actions.";
}

function renderSvg(level: LevelV1, bounds: Rect): string {
  const width = Math.max(1, bounds.xMax - bounds.xMin);
  const height = Math.max(1, bounds.zMax - bounds.zMin);
  const gridRect = `x="${bounds.xMin}" y="${bounds.zMin}" width="${width}" height="${height}"`;

  return `<svg id="map-svg" class="map-board" viewBox="${bounds.xMin} ${bounds.zMin} ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#b8c8b2" stroke-width="0.025" />
      </pattern>
    </defs>
    <rect ${gridRect} fill="url(#grid)" />
    ${level.areas.map((area, index) => renderAreaSvg(area, [index], 0)).join("")}
    ${level.terrain.heightFeatures.map((hill, index) => renderHillSvg(hill, index)).join("")}
    ${level.roads.map((road, index) => renderPathSvg(road.shape, { kind: "road", index }, "#6c7177", road.width, "road")).join("")}
    ${level.dirtPaths.map((path, index) => renderPathSvg(path.shape, { kind: "dirtPath", index }, "#9a6a43", path.width, "dirt")).join("")}
    ${level.fences.map((fence, index) => renderPathSvg(fence.shape, { kind: "fence", index }, "#6f482e", 0.24, "fence")).join("")}
    ${pendingPath ? `<circle cx="${pendingPath.start[0]}" cy="${pendingPath.start[1]}" r="0.3" fill="#1d4ed8" stroke="#ffffff" stroke-width="0.08" />` : ""}
    ${contextMenu ? renderCrosshair(contextMenu.world) : ""}
    <g ${treeAttrs({ kind: "spawn" }, "select")} class="map-object ${sameSelection(selection, { kind: "spawn" }) ? "selected-object" : ""}" transform="translate(${level.spawn.position[0]} ${level.spawn.position[1]}) rotate(${level.spawn.headingDegrees})">
      <circle r="0.38" fill="#ffffff" stroke="#1d4ed8" stroke-width="0.1" />
      <path d="M -0.18 0.15 L 0 -0.22 L 0.18 0.15 Z" fill="#1d4ed8" />
    </g>
    ${renderSelectionHandles(level)}
  </svg>`;
}

function renderCrosshair(point: Point2): string {
  return `<g class="context-crosshair" transform="translate(${point[0]} ${point[1]})">
    <line x1="-0.65" y1="0" x2="-0.16" y2="0" />
    <line x1="0.16" y1="0" x2="0.65" y2="0" />
    <line x1="0" y1="-0.65" x2="0" y2="-0.16" />
    <line x1="0" y1="0.16" x2="0" y2="0.65" />
    <circle r="0.13" />
  </g>`;
}

function renderSelectionHandles(level: LevelV1): string {
  if (selection.kind === "spawn") {
    const heading = (level.spawn.headingDegrees * Math.PI) / 180;
    const point: Point2 = [round(level.spawn.position[0] + Math.cos(heading) * 1.4), round(level.spawn.position[1] + Math.sin(heading) * 1.4)];
    return `<g class="edit-handles"><line class="edit-handle-guide" x1="${level.spawn.position[0]}" y1="${level.spawn.position[1]}" x2="${point[0]}" y2="${point[1]}" />${renderHandle(point, "heading")}</g>`;
  }
  if (selection.kind === "area" && selection.path) {
    const area = getAreaByPath(level.areas, selection.path);
    return area ? `<g class="edit-handles">${renderAreaShapeHandles(area.shape)}</g>` : "";
  }
  if (selection.kind === "heightFeature" && selection.index !== undefined) {
    const hill = level.terrain.heightFeatures[selection.index];
    return hill ? `<g class="edit-handles">${renderAreaShapeHandles(hill.shape)}</g>` : "";
  }
  if (selection.kind === "road" && selection.index !== undefined) return `<g class="edit-handles">${renderPathHandles(level.roads[selection.index]?.shape)}</g>`;
  if (selection.kind === "dirtPath" && selection.index !== undefined) return `<g class="edit-handles">${renderPathHandles(level.dirtPaths[selection.index]?.shape)}</g>`;
  if (selection.kind === "fence" && selection.index !== undefined) return `<g class="edit-handles">${renderPathHandles(level.fences[selection.index]?.shape)}</g>`;
  return "";
}

function renderAreaShapeHandles(shape: AreaShape): string {
  if (shape.type === "circle") {
    const radiusPoint: Point2 = [round(shape.center[0] + shape.radius), shape.center[1]];
    return `${renderHandle(shape.center, "center", undefined, true)}<line class="edit-handle-guide" x1="${shape.center[0]}" y1="${shape.center[1]}" x2="${radiusPoint[0]}" y2="${radiusPoint[1]}" />${renderHandle(radiusPoint, "radius")}`;
  }
  if (shape.type === "polygon") {
    return shape.points.map((point, index) => renderHandle(point, "vertex", index)).join("");
  }
  const rect = rectFromCenter(shape.center, shape.size);
  const corners: Point2[] = [
    [rect.xMin, rect.zMin],
    [rect.xMax, rect.zMin],
    [rect.xMax, rect.zMax],
    [rect.xMin, rect.zMax],
  ];
  return `${renderHandle(shape.center, "center", undefined, true)}${corners.map((point, index) => renderHandle(point, "corner", index)).join("")}`;
}

function renderPathHandles(shape: PathShape | undefined): string {
  if (!shape) return "";
  if (shape.type === "line") return `${renderHandle(shape.start, "start")}${renderHandle(shape.end, "end")}`;
  if (shape.type === "polyline") return shape.points.map((point, index) => renderHandle(point, "vertex", index)).join("");
  const controlLines = shape.curves
    .map((curve, index) => {
      const anchor = index === 0 ? shape.start : shape.curves[index - 1].end;
      return `<line class="edit-handle-guide" x1="${anchor[0]}" y1="${anchor[1]}" x2="${curve.c1[0]}" y2="${curve.c1[1]}" /><line class="edit-handle-guide" x1="${curve.end[0]}" y1="${curve.end[1]}" x2="${curve.c2[0]}" y2="${curve.c2[1]}" />`;
    })
    .join("");
  const curveHandles = shape.curves.flatMap((curve, curveIndex) => [renderHandle(curve.c1, "bezier", curveIndex * 3), renderHandle(curve.c2, "bezier", curveIndex * 3 + 1), renderHandle(curve.end, "bezier", curveIndex * 3 + 2, true)]).join("");
  return `${controlLines}${renderHandle(shape.start, "start", undefined, true)}${curveHandles}`;
}

function renderHandle(point: Point2, handle: string, index?: number, anchor = false): string {
  const indexAttr = index === undefined ? "" : ` data-handle-index="${index}"`;
  return `<circle class="edit-handle ${anchor ? "anchor" : ""}" data-handle="${handle}"${indexAttr} cx="${point[0]}" cy="${point[1]}" r="${anchor ? 0.2 : 0.16}" />`;
}

function renderAreaSvg(area: Area, path: number[], depth: number): string {
  const selected = sameSelection(selection, { kind: "area", path });
  const fill = areaFill(area);
  const stroke = selected ? "#2563eb" : areaStroke(area);
  const strokeWidth = selected ? 0.08 : 0.06;
  const opacity = area.composition === "additive" ? 0.42 : area.role === "background" ? 0.24 : 0.68;
  return `${shapeToSvg(area.shape, `${treeAttrs({ kind: "area", path }, "select")} class="map-object ${selected ? "selected-object" : ""}" fill="${fill}" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}" data-depth="${depth}"`)}
    ${(area.children ?? []).map((child, index) => renderAreaSvg(child, [...path, index], depth + 1)).join("")}`;
}

function areaFill(area: Area): string {
  if (area.role === "bed" || area.surface === "dirt") return "#8a5d3b";
  if (area.composition === "additive") return "#e4c94a";
  if (area.role === "background") return "#9dc58d";
  return "#69a957";
}

function areaStroke(area: Area): string {
  if (area.role === "bed" || area.surface === "dirt") return "#55351f";
  if (area.composition === "additive") return "#b18f1d";
  return "#315f2b";
}

function renderHillSvg(hill: HeightFeature, index: number): string {
  const selected = sameSelection(selection, { kind: "heightFeature", index });
  return shapeToSvg(hill.shape, `${treeAttrs({ kind: "heightFeature", index }, "select")} class="map-object ${selected ? "selected-object" : ""}" fill="#d8d6c8" opacity="0.42" stroke="${selected ? "#2563eb" : "#77715c"}" stroke-width="${selected ? 0.08 : 0.06}" stroke-dasharray="0.4 0.25"`);
}

function shapeToSvg(shape: AreaShape, attrs: string): string {
  if (shape.type === "circle") return `<circle ${attrs} cx="${shape.center[0]}" cy="${shape.center[1]}" r="${shape.radius}" />`;
  if (shape.type === "polygon") return `<polygon ${attrs} points="${shape.points.map((point) => `${point[0]},${point[1]}`).join(" ")}" />`;
  const rect = rectFromCenter(shape.center, shape.size);
  const rotation = shape.rotationDegrees ? ` transform="rotate(${shape.rotationDegrees} ${shape.center[0]} ${shape.center[1]})"` : "";
  return `<rect ${attrs} x="${rect.xMin}" y="${rect.zMin}" width="${rect.xMax - rect.xMin}" height="${rect.zMax - rect.zMin}"${rotation} />`;
}

function renderPathSvg(shape: PathShape, item: Selection, color: string, width: number, className: string): string {
  const selected = sameSelection(selection, item);
  const attrs = `${treeAttrs(item, "select")} class="map-object ${className} ${selected ? "selected-object" : ""}" fill="none" stroke="${selected ? "#2563eb" : color}" stroke-width="${selected ? Math.max(width, 0.08) : width}" stroke-linecap="round" stroke-linejoin="round"`;
  if (shape.type === "line") return `<line ${attrs} x1="${shape.start[0]}" y1="${shape.start[1]}" x2="${shape.end[0]}" y2="${shape.end[1]}" />`;
  if (shape.type === "polyline") return `<polyline ${attrs} points="${shape.points.map((point) => `${point[0]},${point[1]}`).join(" ")}" />`;
  const d = `M ${shape.start[0]} ${shape.start[1]} ${shape.curves.map((curve) => `C ${curve.c1[0]} ${curve.c1[1]}, ${curve.c2[0]} ${curve.c2[1]}, ${curve.end[0]} ${curve.end[1]}`).join(" ")}`;
  return `<path ${attrs} d="${d}" />`;
}

function wireGlobalActions(): void {
  document.onkeydown = (event) => {
    const target = event.target as HTMLElement | null;
    const isTextInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !isTextInput) {
      event.preventDefault();
      undo();
    }
    if (event.key === "Escape") {
      contextMenu = null;
      pendingPath = null;
      dragState = null;
      render();
    }
  };

  document.querySelectorAll(".tree-item").forEach((item) => {
    item.addEventListener("click", () => {
      const next = selectionFromAttributes(item, "tree");
      if (next) selectItem(next);
    });
  });

  document.querySelectorAll("[data-delete-kind]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = selectionFromAttributes(item, "delete");
      if (next) deleteSelection(next);
    });
  });

  wireTreeResizer();
  wireButtons();
  wireJsonActions();
  wireSvg();
}

function wireTreeResizer(): void {
  const treeResizer = document.getElementById("tree-resizer");
  const sidebar = document.querySelector<HTMLElement>(".editor-sidebar");
  treeResizer?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    treeResizer.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      if (!sidebar) return;
      const rect = sidebar.getBoundingClientRect();
      const minPane = 150;
      const handle = 8;
      treePanePx = Math.max(minPane, Math.min(moveEvent.clientY - rect.top, rect.height - minPane - handle));
      sidebar.style.setProperty("--tree-pane", `${treePanePx}px`);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function wireButtons(): void {
  document.getElementById("undo-edit")?.addEventListener("click", undo);
  document.getElementById("toggle-sidebar")?.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    if (!sidebarCollapsed && !sidebarPanes.tree && !sidebarPanes.inspector && !sidebarPanes.json) {
      sidebarPanes = { ...sidebarPanes, inspector: true };
    }
    render();
  });
  wireSidebarPane("tree", "sidebar-pane-tree");
  wireSidebarPane("inspector", "sidebar-pane-inspector");
  wireSidebarPane("json", "sidebar-pane-json");
  document.getElementById("reset-map")?.addEventListener("click", () => {
    pushUndo();
    pack = clone(defaultPack);
    selectedLevelIndex = 0;
    selection = { kind: "level" };
    jsonText = "";
    importMessage = "";
    canvasTool = "select";
    pendingPath = null;
    contextMenu = null;
    render();
  });

  (["select", "spawn", "area", "fence", "road", "dirtPath", "hill"] as CanvasTool[]).forEach((tool) => {
    document.getElementById(`tool-${tool}`)?.addEventListener("click", () => {
      canvasTool = tool;
      if (tool !== pendingPath?.kind) pendingPath = null;
      render();
    });
  });

  document.getElementById("add-level")?.addEventListener("click", addLevel);
  document.getElementById("add-area-root")?.addEventListener("click", () => addAreaAt([0, 0]));
  document.getElementById("add-road")?.addEventListener("click", () => addRoad([-4, 0], [4, 0]));
  document.getElementById("add-dirt-path")?.addEventListener("click", () => addDirtPath([-3, 2], [3, 2]));
  document.getElementById("add-fence")?.addEventListener("click", () => addFence([-4, -4], [4, -4]));
  document.getElementById("add-hill")?.addEventListener("click", () => addHill([0, 0]));
  document.getElementById("delete-selected")?.addEventListener("click", () => deleteSelection(selection));
  document.getElementById("add-child-area")?.addEventListener("click", () => {
    const parentPath = selection.kind === "area" ? selection.path : undefined;
    addAreaAt([0, 0], parentPath);
  });
  document.getElementById("add-vegetation")?.addEventListener("click", () => {
    if (selection.kind !== "area" || !selection.path) return;
    const path = selection.path;
    const area = getAreaByPath(currentLevel().areas, path);
    const index = area?.vegetation.length ?? 0;
    const layer: VegetationLayer = { id: uniqueId("vegetation"), type: "grass", distribution: { type: "uniform", density: 1 } };
    selection = { kind: "vegetation", path, vegetationIndex: index };
    updateSelectedArea(path, (current) => ({ ...current, vegetation: [...current.vegetation, layer] }));
  });

  wireContextButtons();
}

function wireSidebarPane(name: keyof typeof sidebarPanes, id: string): void {
  const pane = document.getElementById(id) as HTMLDetailsElement | null;
  pane?.addEventListener("toggle", () => {
    const nextPanes = { ...sidebarPanes, [name]: pane.open };
    sidebarPanes = nextPanes;
    sidebarCollapsed = false;
    if (!nextPanes.tree && !nextPanes.inspector && !nextPanes.json) render();
  });
}

function wireContextButtons(): void {
  document.getElementById("ctx-select-target")?.addEventListener("click", () => {
    if (contextMenu?.target) selectItem(contextMenu.target);
  });
  document.getElementById("ctx-duplicate-target")?.addEventListener("click", () => {
    if (contextMenu?.target) duplicateSelection(contextMenu.target);
  });
  document.getElementById("ctx-delete-target")?.addEventListener("click", () => {
    if (contextMenu?.target) deleteSelection(contextMenu.target);
  });
  document.getElementById("ctx-move-spawn")?.addEventListener("click", () => {
    if (!contextMenu) return;
    const point = contextMenu.world;
    contextMenu = null;
    selection = { kind: "spawn" };
    updateLevel((level) => ({ ...level, spawn: { ...level.spawn, position: point } }));
  });
  document.getElementById("ctx-add-area")?.addEventListener("click", () => contextMenu && addAreaAt(contextMenu.world));
  document.getElementById("ctx-add-child-area")?.addEventListener("click", () => {
    if (!contextMenu) return;
    const parentPath = contextMenu.target?.kind === "area" ? contextMenu.target.path : selection.kind === "area" ? selection.path : undefined;
    addAreaAt(contextMenu.world, parentPath);
  });
  document.getElementById("ctx-add-clover")?.addEventListener("click", () => contextMenu && addCloverArea(contextMenu.world));
  document.getElementById("ctx-add-flowers")?.addEventListener("click", () => contextMenu && addFlowerArea(contextMenu.world));
  document.getElementById("ctx-add-bed")?.addEventListener("click", () => contextMenu && addBedArea(contextMenu.world));
  document.getElementById("ctx-add-fence-start")?.addEventListener("click", () => {
    if (!contextMenu) return;
    handlePathToolClick("fence", contextMenu.world);
  });
  document.getElementById("ctx-add-road")?.addEventListener("click", () => {
    if (!contextMenu) return;
    addRoad([contextMenu.world[0] - 2, contextMenu.world[1]], [contextMenu.world[0] + 2, contextMenu.world[1]]);
  });
  document.getElementById("ctx-add-dirt-path")?.addEventListener("click", () => {
    if (!contextMenu) return;
    addDirtPath([contextMenu.world[0] - 2, contextMenu.world[1]], [contextMenu.world[0] + 2, contextMenu.world[1]]);
  });
  document.getElementById("ctx-add-hill")?.addEventListener("click", () => contextMenu && addHill(contextMenu.world));
}

function addLevel(): void {
  const nextIndex = pack.levels.length;
  const level: LevelV1 = {
    ...clone(defaultPack.levels[0]),
    code: `level${String(nextIndex + 1).padStart(2, "0")}`,
    name: `Level ${nextIndex + 1}`,
  };
  pushUndo();
  pack = { ...pack, levels: [...pack.levels, level] };
  selectedLevelIndex = nextIndex;
  selection = { kind: "level" };
  render();
}

function addAreaAt(point: Point2, parentPath?: number[]): void {
  const area: Area = {
    id: uniqueId("lawnArea"),
    kind: "area",
    role: "lawn",
    shape: { type: "rectangle", center: point, size: [4, 4] },
    vegetation: [{ id: uniqueId("grassLayer"), type: "grass", distribution: { type: "uniform", density: 1 } }],
  };
  contextMenu = null;
  const path = addAreaToLevel(area, parentPath);
  selection = { kind: "area", path };
  render();
}

function addCloverArea(point: Point2): void {
  const area: Area = {
    id: uniqueId("cloverPatch"),
    kind: "area",
    composition: "replace",
    role: "lawn",
    shape: { type: "circle", center: point, radius: 2 },
    edgeFalloff: 0.6,
    vegetation: [{ id: uniqueId("cloverLayer"), type: "clover", distribution: defaultPerlinDistribution(1, Date.now() % 10000) }],
  };
  contextMenu = null;
  const parentPath = selection.kind === "area" ? selection.path : undefined;
  const path = addAreaToLevel(area, parentPath);
  selection = { kind: "area", path };
  render();
}

function addFlowerArea(point: Point2): void {
  const area: Area = {
    id: uniqueId("flowerScatter"),
    kind: "area",
    composition: "additive",
    shape: { type: "rectangle", center: point, size: [3, 2] },
    edgeFalloff: 0.4,
    vegetation: [
      { id: uniqueId("yellowFlowers"), type: "flowerYellow", distribution: defaultPerlinDistribution(0.2, Date.now() % 10000) },
      { id: uniqueId("redFlowers"), type: "flowerRed", distribution: defaultPerlinDistribution(0.16, (Date.now() + 31) % 10000) },
    ],
  };
  contextMenu = null;
  const parentPath = selection.kind === "area" ? selection.path : undefined;
  const path = addAreaToLevel(area, parentPath);
  selection = { kind: "area", path };
  render();
}

function addBedArea(point: Point2): void {
  const area: Area = {
    id: uniqueId("flowerBed"),
    kind: "area",
    role: "bed",
    shape: { type: "circle", center: point, radius: 1.4 },
    vegetation: [{ id: uniqueId("tulipLayer"), type: "tulip", distribution: { type: "uniform", density: 0.35 } }],
  };
  contextMenu = null;
  const parentPath = selection.kind === "area" ? selection.path : undefined;
  const path = addAreaToLevel(area, parentPath);
  selection = { kind: "area", path };
  render();
}

function addFence(start: Point2, end: Point2): void {
  const fence: Fence = { id: uniqueId("fence"), kind: "fence", height: 1, postSpacing: 2, shape: { type: "line", start, end } };
  contextMenu = null;
  selection = { kind: "fence", index: currentLevel().fences.length };
  updateLevel((level) => ({ ...level, fences: [...level.fences, fence] }));
}

function addRoad(start: Point2, end: Point2): void {
  const road: Road = { id: uniqueId("road"), kind: "road", width: 3.2, shape: { type: "line", start, end } };
  contextMenu = null;
  selection = { kind: "road", index: currentLevel().roads.length };
  updateLevel((level) => ({ ...level, roads: [...level.roads, road] }));
}

function addDirtPath(start: Point2, end: Point2): void {
  const dirtPath: DirtPath = { id: uniqueId("dirtPath"), kind: "dirtPath", width: 1.1, shape: { type: "line", start, end } };
  contextMenu = null;
  selection = { kind: "dirtPath", index: currentLevel().dirtPaths.length };
  updateLevel((level) => ({ ...level, dirtPaths: [...level.dirtPaths, dirtPath] }));
}

function addHill(point: Point2): void {
  const hill: HeightFeature = { id: uniqueId("hill"), type: "hill", shape: { type: "circle", center: point, radius: 4 }, height: 1.5, falloff: 1 };
  contextMenu = null;
  selection = { kind: "heightFeature", index: currentLevel().terrain.heightFeatures.length };
  updateLevel((level) => ({ ...level, terrain: { heightFeatures: [...level.terrain.heightFeatures, hill] } }));
}

function handlePathToolClick(kind: PathTool, point: Point2): void {
  contextMenu = null;
  if (!pendingPath || pendingPath.kind !== kind) {
    pendingPath = { kind, start: point };
    canvasTool = kind;
    render();
    return;
  }
  const start = pendingPath.start;
  pendingPath = null;
  canvasTool = "select";
  if (kind === "fence") addFence(start, point);
  if (kind === "road") addRoad(start, point);
  if (kind === "dirtPath") addDirtPath(start, point);
}

function wireJsonActions(): void {
  const textarea = document.getElementById("json-output") as HTMLTextAreaElement | null;
  textarea?.addEventListener("input", () => {
    jsonText = textarea.value;
  });

  document.getElementById("copy-json")?.addEventListener("click", async () => {
    const value = textarea?.value ?? JSON.stringify(exportJsonValue(), null, 2);
    await navigator.clipboard.writeText(value);
    importMessage = "Copied JSON to clipboard.";
    render();
  });

  document.getElementById("read-clipboard")?.addEventListener("click", async () => {
    try {
      const value = await navigator.clipboard.readText();
      jsonText = value;
      const result = importJsonText(value);
      replacePack(result.pack, result.message);
    } catch (error) {
      importMessage = error instanceof Error ? error.message : "Could not read clipboard.";
      render();
    }
  });

  document.getElementById("load-json")?.addEventListener("click", () => {
    const value = textarea?.value || jsonText || "";
    jsonText = value;
    try {
      const result = importJsonText(value);
      replacePack(result.pack, result.message);
    } catch (error) {
      importMessage = error instanceof Error ? error.message : "Could not import JSON.";
      render();
    }
  });

  const fileInput = document.getElementById("json-file-input") as HTMLInputElement | null;
  document.getElementById("open-json-file")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await importFile(file);
  });

  const dropZone = document.getElementById("json-drop-zone");
  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
  dropZone?.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    await importFile(file);
  });
}

async function importFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    jsonText = text;
    const result = importJsonText(text);
    replacePack(result.pack, result.message);
  } catch (error) {
    importMessage = error instanceof Error ? error.message : "Could not import JSON file.";
    render();
  }
}

function replacePack(nextPack: MapPackV1, message: string): void {
  pushUndo();
  pack = normalizePack(nextPack);
  selectedLevelIndex = 0;
  selection = { kind: "level" };
  importMessage = message;
  contextMenu = null;
  pendingPath = null;
  render();
}

function importJsonText(text: string): { pack: MapPackV1; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Could not parse JSON. The file may be incomplete or have a trailing comma. ${detail}`);
  }
  return importJsonValue(parsed);
}

function importJsonValue(parsed: unknown): { pack: MapPackV1; message: string } {
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

function wireSvg(): void {
  const svg = document.getElementById("map-svg") as SVGSVGElement | null;
  if (!svg) return;

  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const world = eventToWorld(svg, event);
    if (!world) return;
    contextMenu = null;

    const handleElement = (event.target as Element | null)?.closest("[data-handle]") as HTMLElement | null;
    if (handleElement) {
      event.stopPropagation();
      svg.setPointerCapture(event.pointerId);
      editHandleDragState = {
        selection: clone(selection),
        handle: handleElement.dataset.handle ?? "",
        index: handleElement.dataset.handleIndex === undefined ? undefined : Number(handleElement.dataset.handleIndex),
        last: world,
        moved: false,
      };
      return;
    }

    if (canvasTool === "spawn") {
      selection = { kind: "spawn" };
      updateLevel((level) => ({ ...level, spawn: { ...level.spawn, position: world } }));
      return;
    }
    if (canvasTool === "area") {
      addAreaAt(world, selection.kind === "area" ? selection.path : undefined);
      return;
    }
    if (canvasTool === "hill") {
      addHill(world);
      return;
    }
    if (canvasTool === "fence" || canvasTool === "road" || canvasTool === "dirtPath") {
      handlePathToolClick(canvasTool, world);
      return;
    }

    const targetElement = (event.target as Element | null)?.closest("[data-select-kind]");
    const targetSelection = targetElement ? selectionFromAttributes(targetElement, "select") : null;
    if (targetSelection) {
      selection = targetSelection;
      dragState = { selection: targetSelection, last: world, moved: false };
      return;
    }
    selection = { kind: "level" };
    render();
  });

  svg.addEventListener("pointermove", (event) => {
    if (editHandleDragState) {
      const world = eventToWorld(svg, event);
      if (!world) return;
      const dx = round(world[0] - editHandleDragState.last[0]);
      const dz = round(world[1] - editHandleDragState.last[1]);
      if (dx === 0 && dz === 0) return;
      if (!editHandleDragState.moved) {
        pushUndo();
        editHandleDragState.moved = true;
      }
      moveEditHandle(editHandleDragState.selection, editHandleDragState.handle, editHandleDragState.index, world, dx, dz);
      editHandleDragState.last = world;
      return;
    }
    if (!dragState) return;
    const world = eventToWorld(svg, event);
    if (!world) return;
    const dx = round(world[0] - dragState.last[0]);
    const dz = round(world[1] - dragState.last[1]);
    if (dx === 0 && dz === 0) return;
    if (!dragState.moved) {
      pushUndo();
      dragState.moved = true;
    }
    dragState.last = world;
    moveSelection(dragState.selection, dx, dz);
  });

  svg.addEventListener("pointerup", () => {
    if (editHandleDragState) {
      editHandleDragState = null;
      return;
    }
    if (dragState && !dragState.moved) {
      const clicked = dragState.selection;
      dragState = null;
      selectItem(clicked);
      return;
    }
    dragState = null;
  });

  svg.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const world = eventToWorld(svg, event);
    if (!world) return;
    const targetElement = (event.target as Element | null)?.closest("[data-select-kind]");
    const target = targetElement ? selectionFromAttributes(targetElement, "select") ?? undefined : undefined;
    contextMenu = { screenX: event.clientX, screenY: event.clientY, world, target };
    render();
  });
}

render();
