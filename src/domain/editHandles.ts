import { translatePathShape, translatePoint } from "./geometry";
import type { AreaShape, PathShape, Point2 } from "./model";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function updateArray<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, currentIndex) => (currentIndex === index ? next : item));
}

export function moveAreaShapeHandle(shape: AreaShape, handle: string, index: number | undefined, world: Point2, dx: number, dz: number): AreaShape {
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
    if (handle === "rotate") {
      const rotationDegrees = Math.atan2(world[1] - shape.center[1], world[0] - shape.center[0]) * (180 / Math.PI) + 90;
      return { ...shape, rotationDegrees: round(rotationDegrees) };
    }
  }
  if (shape.type === "polygon" && handle === "vertex" && index !== undefined) {
    return { ...shape, points: updateArray(shape.points, index, [round(world[0]), round(world[1])]) };
  }
  return shape;
}

export function movePathShapeHandle(shape: PathShape, handle: string, index: number | undefined, world: Point2, dx: number, dz: number): PathShape {
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
    if (key === "end") {
      const curve = shape.curves[curveIndex];
      return { ...shape, curves: updateArray(shape.curves, curveIndex, { ...curve, c1: translatePoint(curve.c1, dx, dz), c2: translatePoint(curve.c2, dx, dz), end: point }) };
    }
    return { ...shape, curves: updateArray(shape.curves, curveIndex, { ...shape.curves[curveIndex], [key]: point }) };
  }
  return translatePathShape(shape, dx, dz);
}
