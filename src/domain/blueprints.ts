import type { Area, Point2 } from "./model";
import { defaultPerlinDistribution } from "./model";

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

export function createAreaFromBlueprint(key: string, point: Point2, nextId: (base: string) => string, seed = defaultSeed): Area | null {
  const blueprint = areaBlueprints.find((item) => item.key === key);
  return blueprint ? blueprint.create(point, nextId, seed) : null;
}

function defaultSeed(): number {
  return Date.now() % 10000;
}
