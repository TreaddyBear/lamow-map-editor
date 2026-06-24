import { rectFromCenter } from "../../domain/geometry";
import type { AreaShape, LevelV1, PathShape, Point2, Selection } from "../../domain/model";
import { getAreaByPath, round } from "../../editor/utils";

export type HandlePrimitive =
  | { kind: "guide"; start: Point2; end: Point2 }
  | { kind: "handle"; point: Point2; handle: string; index?: number; anchor?: boolean };

export function selectionHandlePrimitives(level: LevelV1, selection: Selection): HandlePrimitive[] {
  if (selection.kind === "spawn") {
    const heading = (level.spawn.headingDegrees * Math.PI) / 180;
    const point: Point2 = [round(level.spawn.position[0] + Math.cos(heading) * 1.4), round(level.spawn.position[1] + Math.sin(heading) * 1.4)];
    return [{ kind: "guide", start: level.spawn.position, end: point }, { kind: "handle", point, handle: "heading" }];
  }
  if (selection.kind === "area" && selection.path) {
    const area = getAreaByPath(level.areas, selection.path);
    return areaHandles(area?.shape);
  }
  if (selection.kind === "heightFeature" && selection.index !== undefined) return areaHandles(level.terrain.heightFeatures[selection.index]?.shape);
  const path = selection.kind === "road" && selection.index !== undefined ? level.roads[selection.index]?.shape : selection.kind === "dirtPath" && selection.index !== undefined ? level.dirtPaths[selection.index]?.shape : selection.kind === "fence" && selection.index !== undefined ? level.fences[selection.index]?.shape : undefined;
  return path ? pathHandles(path) : [];
}

function areaHandles(shape?: AreaShape): HandlePrimitive[] {
  if (!shape) return [];
  if (shape.type === "circle") {
    const radiusPoint: Point2 = [round(shape.center[0] + shape.radius), shape.center[1]];
    return [{ kind: "handle", point: shape.center, handle: "center", anchor: true }, { kind: "guide", start: shape.center, end: radiusPoint }, { kind: "handle", point: radiusPoint, handle: "radius" }];
  }
  if (shape.type === "polygon") return shape.points.map((point, index) => ({ kind: "handle", point, handle: "vertex", index }));
  const rect = rectFromCenter(shape.center, shape.size);
  const rotation = ((shape.rotationDegrees ?? 0) * Math.PI) / 180;
  const rotatePoint = (point: Point2): Point2 => {
    const dx = point[0] - shape.center[0];
    const dz = point[1] - shape.center[1];
    return [round(shape.center[0] + dx * Math.cos(rotation) - dz * Math.sin(rotation)), round(shape.center[1] + dx * Math.sin(rotation) + dz * Math.cos(rotation))];
  };
  const corners = [[rect.xMin, rect.zMin], [rect.xMax, rect.zMin], [rect.xMax, rect.zMax], [rect.xMin, rect.zMax]].map((point) => rotatePoint(point as Point2));
  const top = rotatePoint([shape.center[0], rect.zMin]);
  const rotate = rotatePoint([shape.center[0], rect.zMin - Math.max(0.8, Math.min(shape.size[0], shape.size[1]) * 0.25)]);
  return [{ kind: "handle", point: shape.center, handle: "center", anchor: true }, ...corners.map((point, index) => ({ kind: "handle" as const, point, handle: "corner", index })), { kind: "guide", start: top, end: rotate }, { kind: "handle", point: rotate, handle: "rotate" }];
}

function pathHandles(shape: PathShape): HandlePrimitive[] {
  if (shape.type === "line") return [{ kind: "handle", point: shape.start, handle: "start" }, { kind: "handle", point: shape.end, handle: "end" }];
  if (shape.type === "polyline") return shape.points.map((point, index) => ({ kind: "handle", point, handle: "vertex", index }));
  return [{ kind: "handle", point: shape.start, handle: "start", anchor: true }, ...shape.curves.flatMap((curve, curveIndex) => [
    { kind: "handle" as const, point: curve.c1, handle: "bezier", index: curveIndex * 3 },
    { kind: "handle" as const, point: curve.c2, handle: "bezier", index: curveIndex * 3 + 1 },
    { kind: "handle" as const, point: curve.end, handle: "bezier", index: curveIndex * 3 + 2, anchor: true },
  ])];
}
