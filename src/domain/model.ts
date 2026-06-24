export type Point2 = [x: number, z: number];
export type Point3 = [x: number, y: number, z: number];
export type Rect = { xMin: number; xMax: number; zMin: number; zMax: number };
export type Vec3 = { x: number; y: number; z: number };

export type CoordinateMetadata = {
  axes: { x: "east"; y: "up"; z: "north" };
  point2: ["x", "z"];
  point3: ["x", "y", "z"];
  angles: {
    unit: "degrees";
    zero: "+x (east)";
    positive: string;
    direction: string;
  };
};

export type PackInfo = {
  prefix: string;
  name: string;
};

export type MapPackV1 = {
  version: 1;
  units: "meters";
  coordinates?: CoordinateMetadata;
  pack: PackInfo;
  levels: LevelV1[];
};

export type LevelV1 = {
  code: string;
  name: string;
  parSeconds: number;
  spawn: Spawn;
  areas: Area[];
  roads: Road[];
  dirtPaths: DirtPath[];
  fences: Fence[];
  terrain: Terrain;
  objects: unknown[];
  tags?: string[];
};

export type Spawn = {
  position: Point2;
  headingDegrees: number;
};

export type EditorHints = {
  locked?: boolean;
  layer?: string;
};

export type AuthoredItem = {
  id: string;
  name?: string;
  tags?: string[];
  editor?: EditorHints;
};

export type AreaShape =
  | { type: "rectangle"; center: Point2; size: Point2; rotationDegrees?: number }
  | { type: "circle"; center: Point2; radius: number }
  | { type: "polygon"; points: Point2[] };

export type PathShape =
  | { type: "line"; start: Point2; end: Point2 }
  | { type: "polyline"; points: Point2[] }
  | { type: "cubicBezierPath"; start: Point2; curves: { c1: Point2; c2: Point2; end: Point2 }[] };

export type Distribution = UniformDistribution | PerlinDistribution;

export type UniformDistribution = {
  type: "uniform";
  density: number;
};

export type PerlinDistribution = {
  type: "perlin";
  density: number;
  noise: {
    seed: number;
    octaves: { frequency: number; weight: number }[];
    domainWarp?: number;
    threshold: number;
    softness: number;
  };
};

export type VegetationLayer = {
  id: string;
  type: FoliageType;
  distribution: Distribution;
};

export type Area = AuthoredItem & {
  kind: "area";
  composition?: "replace" | "additive";
  role?: "background" | "lawn" | "bed";
  mowable?: boolean;
  surface?: "grass" | "dirt";
  shape: AreaShape;
  edgeFalloff?: number;
  vegetation: VegetationLayer[];
  children?: Area[];
};

export type Road = AuthoredItem & {
  kind: "road";
  width: number;
  shape: PathShape;
};

export type DirtPath = AuthoredItem & {
  kind: "dirtPath";
  width: number;
  shape: PathShape;
};

export type Fence = AuthoredItem & {
  kind: "fence";
  height: number;
  postSpacing?: number;
  shape: PathShape;
};

export type Terrain = {
  heightFeatures: HeightFeature[];
};

export type HeightFeature = AuthoredItem & {
  type: "hill";
  shape: AreaShape;
  height: number;
  falloff: number;
};

export type FoliageType =
  | "grass"
  | "clover"
  | "leaf"
  | "dandelion"
  | "flowerBlue"
  | "flowerWhite"
  | "flowerYellow"
  | "flowerRed"
  | "tulip";

export type LegacySegment = Rect & { width?: number; height?: number; center?: Vec3 };
export type LegacyFenceSegment = { start?: Vec3; end?: Vec3 };
export type LegacyFlowerBed = Rect & { count?: number };
export type LegacyFlowerField = { variant?: "blue" | "white" | "yellow" | "red"; area?: Rect; spacing?: number };
export type LegacyCloverPatch = { x?: number; z?: number; radius?: number; spacing?: number; grassKeep?: number };
export type LegacyMapSpec = {
  code?: string;
  name?: string;
  parSeconds?: number;
  spawn?: Vec3;
  segments?: LegacySegment[];
  fenceSegments?: LegacyFenceSegment[];
  flowerBeds?: LegacyFlowerBed[];
  dandelionCount?: number;
  flowerFields?: LegacyFlowerField[];
  cloverPatches?: LegacyCloverPatch[];
};

export type CanvasTool = "select" | "spawn" | "area" | "fence" | "road" | "dirtPath" | "hill";
export type PathTool = "fence" | "road" | "dirtPath";
export type SelectionKind = "level" | "spawn" | "area" | "vegetation" | "road" | "dirtPath" | "fence" | "heightFeature" | "objects";
export type Selection = { kind: SelectionKind; path?: number[]; index?: number; vegetationIndex?: number };
export type ContextMenuState = { screenX: number; screenY: number; world: Point2; target?: Selection } | null;
export type DragState = { selection: Selection; last: Point2; moved: boolean } | null;
export type PendingPathState = { kind: PathTool; start: Point2 } | null;
export type HistoryEntry = {
  pack: MapPackV1;
  selectedLevelIndex: number;
  selection: Selection;
};

export const defaultCoordinates: CoordinateMetadata = {
  axes: { x: "east", y: "up", z: "north" },
  point2: ["x", "z"],
  point3: ["x", "y", "z"],
  angles: {
    unit: "degrees",
    zero: "+x (east)",
    positive: "counter-clockwise in the XZ plane, from +x toward +z",
    direction: "heading T maps to ground vector (x, z) = (cos T, sin T)",
  },
};

export const foliageRegistry: { key: FoliageType; label: string; category: "groundcover" | "wildflower" | "prizeFlower" | "decor" }[] = [
  { key: "grass", label: "Grass", category: "groundcover" },
  { key: "clover", label: "Clover", category: "groundcover" },
  { key: "leaf", label: "Leaf", category: "decor" },
  { key: "dandelion", label: "Dandelion", category: "wildflower" },
  { key: "flowerBlue", label: "Blue Flower", category: "wildflower" },
  { key: "flowerWhite", label: "White Flower", category: "wildflower" },
  { key: "flowerYellow", label: "Yellow Flower", category: "wildflower" },
  { key: "flowerRed", label: "Red Flower", category: "wildflower" },
  { key: "tulip", label: "Tulip", category: "prizeFlower" },
];

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function defaultPerlinDistribution(density = 1, seed = 1): PerlinDistribution {
  return {
    type: "perlin",
    density,
    noise: {
      seed,
      octaves: [
        { frequency: 0.4, weight: 1 },
        { frequency: 0.9, weight: 0.4 },
      ],
      domainWarp: 0.3,
      threshold: 0.5,
      softness: 0.12,
    },
  };
}

export const defaultPack: MapPackV1 = {
  version: 1,
  units: "meters",
  coordinates: defaultCoordinates,
  pack: { prefix: "bgrn", name: "Beta Green" },
  levels: [
    {
      code: "ell",
      name: "Front Lawn",
      parSeconds: 300,
      spawn: { position: [-5, 0], headingDegrees: 0 },
      areas: [
        {
          id: "yard",
          kind: "area",
          role: "background",
          shape: { type: "rectangle", center: [0, 0], size: [120, 120] },
          vegetation: [{ id: "yardGrass", type: "grass", distribution: { type: "uniform", density: 0.25 } }],
          children: [
            {
              id: "frontLawn",
              kind: "area",
              role: "lawn",
              shape: { type: "rectangle", center: [0, 0], size: [18, 14] },
              vegetation: [{ id: "frontLawnGrass", type: "grass", distribution: { type: "uniform", density: 1 } }],
              children: [
                {
                  id: "cloverPatch",
                  kind: "area",
                  composition: "replace",
                  role: "lawn",
                  shape: { type: "circle", center: [-5, -3], radius: 2.2 },
                  edgeFalloff: 0.6,
                  vegetation: [
                    {
                      id: "cloverPatchLayer",
                      type: "clover",
                      distribution: defaultPerlinDistribution(1, 7),
                    },
                  ],
                },
                {
                  id: "flowerScatter",
                  kind: "area",
                  composition: "additive",
                  shape: { type: "rectangle", center: [5.5, -1.5], size: [3, 2] },
                  edgeFalloff: 0.4,
                  vegetation: [
                    { id: "flowerScatterYellow", type: "flowerYellow", distribution: defaultPerlinDistribution(0.2, 21) },
                    { id: "flowerScatterRed", type: "flowerRed", distribution: defaultPerlinDistribution(0.16, 99) },
                  ],
                },
                {
                  id: "roseBed",
                  kind: "area",
                  role: "bed",
                  shape: { type: "circle", center: [4, 3], radius: 1.4 },
                  vegetation: [{ id: "roseBedTulips", type: "tulip", distribution: { type: "uniform", density: 0.35 } }],
                },
              ],
            },
          ],
        },
      ],
      roads: [{ id: "mainRoad", kind: "road", width: 3.2, shape: { type: "line", start: [13, -18], end: [13, 18] } }],
      dirtPaths: [{ id: "gardenPath", kind: "dirtPath", width: 1.1, shape: { type: "line", start: [-8, 2], end: [4, 3] } }],
      fences: [
        {
          id: "westFence",
          kind: "fence",
          height: 1,
          postSpacing: 2,
          shape: { type: "polyline", points: [[-9, -7], [9, -7], [9, 7], [-9, 7], [-9, -7]] },
        },
      ],
      terrain: {
        heightFeatures: [{ id: "softHillA", type: "hill", shape: { type: "circle", center: [-20, -12], radius: 8 }, height: 3.5, falloff: 1 }],
      },
      objects: [],
      tags: [],
    },
  ],
};
