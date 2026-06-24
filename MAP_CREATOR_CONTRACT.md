# LaMow Map Creator Contract

Map creator output should be plain JSON-compatible data that can be converted into the game `LawnMap` objects. Coordinates are in world meters on the X/Z ground plane; Y is height. Use `{ x, y, z }` vectors in exported data, then convert to Babylon `new Vector3(x, y, z)` when importing.

## Required Map Shape

```ts
type Vec3 = { x: number; y: number; z: number };
type Rect = { xMin: number; xMax: number; zMin: number; zMax: number };

type Segment = Rect & {
  width: number;   // xMax - xMin
  height: number;  // zMax - zMin
  center: Vec3;    // { x: (xMin + xMax) / 2, y: 0, z: (zMin + zMax) / 2 }
};

type FenceSegment = { start: Vec3; end: Vec3 };
type FlowerBed = Rect & { count: number };
type FlowerVariant = "blue" | "white" | "yellow" | "red";
type FlowerField = { variant: FlowerVariant; area: Rect; spacing: number };
type CloverPatch = { x: number; z: number; radius: number; spacing?: number; grassKeep?: number };

type LawnMapSpec = {
  code: string;
  name: string;
  parSeconds: number;
  spawn: Vec3;
  segments: Segment[];
  fenceSegments: FenceSegment[];
  flowerBeds: FlowerBed[];
  dandelionCount: number;
  flowerFields?: FlowerField[];
  cloverPatches?: CloverPatch[];
};
```

## Field Meaning

`code` is the durable save/import key. Keep it stable after publishing. `name` is display text and can change. `parSeconds` is the target clear time for scoring. `spawn` should be inside a lawn segment; current maps use `y: 0.18`.

`segments` are the mowable lawn footprint, expressed as one or more axis-aligned rectangles. Concave lawns should be composed from multiple rectangles. Creator tools should derive `width`, `height`, and `center` from the rectangle bounds instead of hand-editing them.

`fenceSegments` are straight fence lines. Use an empty array for an open map. Fenced maps normally place fence endpoints slightly outside the lawn bounds, around `0.25m`, so grass and mower collision have breathing room.

`flowerBeds` are rectangular protected flower-bed areas with a generated flower `count`. They should sit inside the lawn footprint and should not cover the spawn point.

`dandelionCount` is a simple whole-map count for scattered dandelions. Use `0` when none are wanted.

`flowerFields` are optional rectangular carpets of saddle-petal flowers. `spacing` is meters between candidate flowers; smaller is denser. Multiple fields may overlap, including two colors over the same area for mixed color patches.

`cloverPatches` are optional circular clover areas. `radius` is meters. `grassKeep` controls how much ordinary grass remains inside the clover, where `0` means clover-only and `0.25` keeps a quarter of normal grass. `spacing` is optional and can usually be omitted.

## Validation Rules

Ensure every segment has `xMin < xMax` and `zMin < zMax`. Ensure spawn is inside at least one segment and outside special protected areas. Fence, flower, and clover features may extend near edges, but their intended playable or visible focus should overlap the segment union. For open maps, keep the lawn large enough that the camera does not reveal a hard edge unless that edge is intentional.

Export maps as an array of `LawnMapSpec` plus a lookup of `parSeconds` by `code`, or export each map with `parSeconds` and let the importer build the game config.
