import type { Area, EditorBlueprint, Point2 } from "./model";
import { clone, defaultPerlinDistribution } from "./model";
import { normalizeArea } from "./normalization";

export type AreaBlueprintKey = "clover" | "flowers" | "bed";

export type AreaBlueprint = {
  key: AreaBlueprintKey;
  label: string;
  create: (point: Point2, nextId: (base: string) => string, seed: () => number) => Area;
};

export const areaBlueprints: AreaBlueprint[] = [
  {
    key: "clover",
    label: "Clover patch here",
    create: (point, nextId, seed) => ({
      id: nextId("cloverPatch"),
      kind: "area",
      composition: "replace",
      role: "lawn",
      shape: { type: "circle", center: point, radius: 2 },
      edgeFalloff: 0.6,
      vegetation: [{ id: nextId("cloverLayer"), type: "clover", distribution: defaultPerlinDistribution(1, seed()) }],
    }),
  },
  {
    key: "flowers",
    label: "Flower scatter here",
    create: (point, nextId, seed) => ({
      id: nextId("flowerScatter"),
      kind: "area",
      composition: "additive",
      shape: { type: "rectangle", center: point, size: [3, 2] },
      edgeFalloff: 0.4,
      vegetation: [
        { id: nextId("yellowFlowers"), type: "flowerYellow", distribution: defaultPerlinDistribution(0.2, seed()) },
        { id: nextId("redFlowers"), type: "flowerRed", distribution: defaultPerlinDistribution(0.16, seed()) },
      ],
    }),
  },
  {
    key: "bed",
    label: "Bed here",
    create: (point, nextId) => ({
      id: nextId("flowerBed"),
      kind: "area",
      role: "bed",
      shape: { type: "circle", center: point, radius: 1.4 },
      vegetation: [{ id: nextId("tulipLayer"), type: "tulip", distribution: { type: "uniform", density: 0.35 } }],
    }),
  },
];

export function createAreaFromBlueprint(key: string, point: Point2, nextId: (base: string) => string, seed = defaultSeed, customBlueprints: EditorBlueprint[] = []): Area | null {
  const custom = customBlueprints.find((item) => item.key === key);
  if (custom) return instantiateCustomBlueprint(custom, point, nextId);
  const blueprint = areaBlueprints.find((item) => item.key === key);
  return blueprint ? blueprint.create(point, nextId, seed) : null;
}

export function allBlueprintOptions(customBlueprints: EditorBlueprint[] = []) {
  return [
    ...areaBlueprints.map((item) => ({ key: item.key, label: item.label, builtin: true })),
    ...customBlueprints.map((item) => ({ key: item.key, label: `${item.label} here`, builtin: false })),
  ];
}

export function blueprintFromArea(area: Area, label = area.name || area.id): EditorBlueprint {
  const normalized = normalizeArea(clone(area));
  return {
    key: uniqueBlueprintKey(label || normalized.id),
    label: label || normalized.id,
    baseId: normalized.id || "area",
    area: { ...normalized, children: normalized.children?.map((child) => normalizeArea(child)) },
  };
}

function instantiateCustomBlueprint(blueprint: EditorBlueprint, point: Point2, nextId: (base: string) => string): Area {
  const area = normalizeArea(clone(blueprint.area));
  const next = rewriteAreaIds(area, blueprint.baseId || area.id || "area", nextId);
  return moveAreaAnchor(next, point);
}

function rewriteAreaIds(area: Area, base: string, nextId: (base: string) => string): Area {
  const id = nextId(base);
  return {
    ...area,
    id,
    vegetation: area.vegetation.map((layer) => ({ ...layer, id: nextId(layer.id || `${id}Layer`) })),
    children: area.children?.map((child) => rewriteAreaIds(child, child.id || `${id}Child`, nextId)),
  };
}

function moveAreaAnchor(area: Area, point: Point2): Area {
  const anchor = areaAnchor(area);
  const dx = Number((point[0] - anchor[0]).toFixed(3));
  const dz = Number((point[1] - anchor[1]).toFixed(3));
  return translateArea(area, dx, dz);
}

function areaAnchor(area: Area): Point2 {
  if (area.shape.type === "circle" || area.shape.type === "rectangle") return area.shape.center;
  return area.shape.points[0] ?? [0, 0];
}

function translateArea(area: Area, dx: number, dz: number): Area {
  const translatePoint = (point: Point2): Point2 => [Number((point[0] + dx).toFixed(3)), Number((point[1] + dz).toFixed(3))];
  const shape = area.shape.type === "polygon"
    ? { ...area.shape, points: area.shape.points.map(translatePoint) }
    : { ...area.shape, center: translatePoint(area.shape.center) };
  return { ...area, shape, children: area.children?.map((child) => translateArea(child, dx, dz)) };
}

function uniqueBlueprintKey(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "blueprint";
  return `custom:${slug}:${Date.now().toString(36)}`;
}

function defaultSeed(): number {
  return Date.now() % 10000;
}
