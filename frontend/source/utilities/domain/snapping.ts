import { pathPoints, shapeBounds } from "./geometry";
import type { Area, AreaShape, LevelV1, Point2, Selection } from "./model";

type SnapSettingsLike = {
  enabled: boolean;
  increment: number;
  mode: "toGrid" | "byIncrement";
};

export function snapPoint(point: Point2, settings: SnapSettingsLike): Point2 {
  if (!settings.enabled) return point;
  const increment = snapIncrement(settings);
  return [round(Math.round(point[0] / increment) * increment), round(Math.round(point[1] / increment) * increment)];
}

export function snapMoveDelta(rawDelta: Point2, anchor: Point2 | null, settings: SnapSettingsLike): Point2 {
  if (!settings.enabled) return rawDelta;
  const increment = snapIncrement(settings);
  if (settings.mode === "byIncrement" || !anchor) {
    return [round(Math.round(rawDelta[0] / increment) * increment), round(Math.round(rawDelta[1] / increment) * increment)];
  }
  const target = snapPoint([anchor[0] + rawDelta[0], anchor[1] + rawDelta[1]], settings);
  return [round(target[0] - anchor[0]), round(target[1] - anchor[1])];
}

export function closestSelectionPoint(level: LevelV1, selection: Selection, world: Point2): Point2 | null {
  const points = selectionPoints(level, selection);
  if (points.length === 0) return null;
  return points.reduce((best, point) => (distanceSquared(point, world) < distanceSquared(best, world) ? point : best), points[0]);
}

function selectionPoints(level: LevelV1, selection: Selection): Point2[] {
  if (selection.kind === "spawn") return [level.spawn.position];
  if (selection.kind === "area" && selection.path) {
    const area = getAreaByPath(level.areas, selection.path);
    return area ? areaShapePoints(area.shape) : [];
  }
  if (selection.kind === "heightFeature" && selection.index !== undefined) return areaShapePoints(level.terrain.heightFeatures[selection.index]?.shape);
  if (selection.kind === "road" && selection.index !== undefined) return pathPoints(level.roads[selection.index].shape);
  if (selection.kind === "dirtPath" && selection.index !== undefined) return pathPoints(level.dirtPaths[selection.index].shape);
  if (selection.kind === "fence" && selection.index !== undefined) return pathPoints(level.fences[selection.index].shape);
  return [];
}

function getAreaByPath(areas: Area[], path: number[]): Area | undefined {
  return path.reduce<Area | undefined>((current, index) => (current ? current.children?.[index] : areas[index]), undefined);
}

function areaShapePoints(shape?: AreaShape): Point2[] {
  if (!shape) return [];
  if (shape.type === "circle") return [shape.center, [round(shape.center[0] + shape.radius), shape.center[1]]];
  if (shape.type === "polygon") return shape.points;
  const bounds = shapeBounds(shape);
  return [
    [bounds.xMin, bounds.zMin],
    [bounds.xMax, bounds.zMin],
    [bounds.xMax, bounds.zMax],
    [bounds.xMin, bounds.zMax],
    shape.center,
  ];
}

function snapIncrement(settings: SnapSettingsLike): number {
  return Math.max(0.1, Number(settings.increment) || 1);
}

function distanceSquared(a: Point2, b: Point2): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
