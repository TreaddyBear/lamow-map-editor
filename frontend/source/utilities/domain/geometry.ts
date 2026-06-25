import type { Area, AreaShape, PathShape, Point2, Rect } from "./model";

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function rectFromCenter(center: Point2, size: Point2): Rect {
  return {
    xMin: center[0] - Math.abs(size[0]) / 2,
    xMax: center[0] + Math.abs(size[0]) / 2,
    zMin: center[1] - Math.abs(size[1]) / 2,
    zMax: center[1] + Math.abs(size[1]) / 2,
  };
}

export function normalizeRect(rect: Rect): Rect {
  return {
    xMin: Math.min(rect.xMin, rect.xMax),
    xMax: Math.max(rect.xMin, rect.xMax),
    zMin: Math.min(rect.zMin, rect.zMax),
    zMax: Math.max(rect.zMin, rect.zMax),
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.xMin < b.xMax && a.xMax > b.xMin && a.zMin < b.zMax && a.zMax > b.zMin;
}

export function rectContainsRect(parent: Rect, child: Rect): boolean {
  return child.xMin >= parent.xMin && child.xMax <= parent.xMax && child.zMin >= parent.zMin && child.zMax <= parent.zMax;
}

export function shapeBounds(shape: AreaShape): Rect {
  if (shape.type === "circle") {
    return { xMin: shape.center[0] - shape.radius, xMax: shape.center[0] + shape.radius, zMin: shape.center[1] - shape.radius, zMax: shape.center[1] + shape.radius };
  }
  if (shape.type === "polygon") {
    const xs = shape.points.map((point) => point[0]);
    const zs = shape.points.map((point) => point[1]);
    return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
  }
  return rectFromCenter(shape.center, shape.size);
}

export function pathBounds(shape: PathShape): Rect {
  const points = pathPoints(shape);
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[1]);
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), zMin: Math.min(...zs), zMax: Math.max(...zs) };
}

export function pathPoints(shape: PathShape): Point2[] {
  if (shape.type === "line") return [shape.start, shape.end];
  if (shape.type === "polyline") return shape.points;
  return [shape.start, ...shape.curves.flatMap((curve) => [curve.c1, curve.c2, curve.end])];
}

export function translatePoint(point: Point2, dx: number, dz: number): Point2 {
  return [round(point[0] + dx), round(point[1] + dz)];
}

export function translateShape(shape: AreaShape, dx: number, dz: number): AreaShape {
  if (shape.type === "circle") return { ...shape, center: translatePoint(shape.center, dx, dz) };
  if (shape.type === "polygon") return { ...shape, points: shape.points.map((point) => translatePoint(point, dx, dz)) };
  return { ...shape, center: translatePoint(shape.center, dx, dz) };
}

export function translatePathShape(shape: PathShape, dx: number, dz: number): PathShape {
  if (shape.type === "line") return { ...shape, start: translatePoint(shape.start, dx, dz), end: translatePoint(shape.end, dx, dz) };
  if (shape.type === "polyline") return { ...shape, points: shape.points.map((point) => translatePoint(point, dx, dz)) };
  return {
    ...shape,
    start: translatePoint(shape.start, dx, dz),
    curves: shape.curves.map((curve) => ({
      c1: translatePoint(curve.c1, dx, dz),
      c2: translatePoint(curve.c2, dx, dz),
      end: translatePoint(curve.end, dx, dz),
    })),
  };
}

export function translateArea(area: Area, dx: number, dz: number): Area {
  return {
    ...area,
    shape: translateShape(area.shape, dx, dz),
    children: area.children?.map((child) => translateArea(child, dx, dz)),
  };
}
