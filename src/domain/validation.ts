import { rectContainsRect, rectsOverlap, shapeBounds } from "./geometry";
import { foliageRegistry } from "./model";
import type { Area, AreaShape, Distribution, LevelV1, MapPackV1, PathShape, Point2 } from "./model";

function pathKey(path?: number[]): string {
  return path?.join(".") ?? "";
}

export function collectAuthoredIds(level: LevelV1): string[] {
  const ids: string[] = [];
  const visitArea = (area: Area): void => {
    ids.push(area.id);
    area.vegetation.forEach((layer) => ids.push(layer.id));
    area.children?.forEach(visitArea);
  };
  level.areas.forEach(visitArea);
  level.roads.forEach((item) => ids.push(item.id));
  level.dirtPaths.forEach((item) => ids.push(item.id));
  level.fences.forEach((item) => ids.push(item.id));
  level.terrain.heightFeatures.forEach((item) => ids.push(item.id));
  return ids;
}

export function validateLevel(currentPack: MapPackV1, level: LevelV1): string[] {
  const errors: string[] = [];
  if (currentPack.version !== 1) errors.push("Map pack version must be 1.");
  if (currentPack.units !== "meters") errors.push('Map pack units must be "meters".');
  if (!currentPack.pack.prefix.trim()) errors.push("Pack prefix is required.");
  if (!/^[A-Za-z]/.test(currentPack.pack.prefix)) errors.push("Pack prefix should start with a simple Latin alphabetic character.");
  if (!level.code.trim()) errors.push("Level code is required.");
  if (!/^[A-Za-z]/.test(level.code)) errors.push("Level code should start with a simple Latin alphabetic character.");
  if (!level.name.trim()) errors.push("Level name is required.");
  if (level.parSeconds <= 0) errors.push("Par seconds must be greater than 0.");
  if (level.areas.length === 0) errors.push("Add at least one area.");
  if (level.objects.length > 0) errors.push("Objects are reserved in draft v1 and should stay empty until the object schema is defined.");

  const matchingCodes = currentPack.levels.filter((item) => item.code.toLowerCase() === level.code.toLowerCase());
  if (matchingCodes.length > 1) errors.push(`Level code ${level.code} appears more than once in this pack.`);

  const idCounts = new Map<string, number>();
  collectAuthoredIds(level).forEach((id) => idCounts.set(id.toLowerCase(), (idCounts.get(id.toLowerCase()) ?? 0) + 1));
  [...idCounts.entries()].forEach(([id, count]) => {
    if (count > 1) errors.push(`Duplicate authored id in level: ${id}.`);
  });

  const visitArea = (area: Area, path: number[], parent?: Area): void => {
    if (!area.id.trim()) errors.push(`Area ${pathKey(path)} needs an id.`);
    validateAuthoredId(area.id, `Area ${pathKey(path)}`, errors);
    validateAreaShape(area.shape, `Area ${area.id}`, errors);
    validateAreaSemantics(area, errors);
    area.vegetation.forEach((layer) => {
      validateAuthoredId(layer.id, `Vegetation layer ${layer.id}`, errors);
      if (!foliageRegistry.some((entry) => entry.key === layer.type)) errors.push(`Vegetation layer ${layer.id} uses unknown foliage type ${layer.type}.`);
      validateDistribution(layer.distribution, `Vegetation layer ${layer.id}`, errors);
    });
    if (parent && !rectContainsRect(shapeBounds(parent.shape), shapeBounds(area.shape))) {
      errors.push(`Area ${area.id} may extend outside parent ${parent.id}.`);
    }
    const children = area.children ?? [];
    children.forEach((child, index) => visitArea(child, [...path, index], area));
    children.forEach((child, index) => {
      children.slice(index + 1).forEach((sibling) => {
        if (rectsOverlap(shapeBounds(child.shape), shapeBounds(sibling.shape))) {
          errors.push(`Sibling areas ${child.id} and ${sibling.id} overlap by bounds.`);
        }
      });
    });
  };
  level.areas.forEach((area, index) => visitArea(area, [index]));

  level.roads.forEach((road) => {
    validateAuthoredId(road.id, `Road ${road.id}`, errors);
    if (road.width <= 0) errors.push(`Road ${road.id} width must be greater than 0.`);
    validatePathShape(road.shape, `Road ${road.id}`, errors);
  });
  level.dirtPaths.forEach((path) => {
    validateAuthoredId(path.id, `Dirt path ${path.id}`, errors);
    if (path.width <= 0) errors.push(`Dirt path ${path.id} width must be greater than 0.`);
    validatePathShape(path.shape, `Dirt path ${path.id}`, errors);
  });
  level.fences.forEach((fence) => {
    validateAuthoredId(fence.id, `Fence ${fence.id}`, errors);
    if (fence.height <= 0) errors.push(`Fence ${fence.id} height must be greater than 0.`);
    if (fence.postSpacing !== undefined && fence.postSpacing <= 0) errors.push(`Fence ${fence.id} post spacing must be greater than 0.`);
    validatePathShape(fence.shape, `Fence ${fence.id}`, errors);
  });
  level.terrain.heightFeatures.forEach((hill) => {
    validateAuthoredId(hill.id, `Hill ${hill.id}`, errors);
    validateAreaShape(hill.shape, `Hill ${hill.id}`, errors);
    if (hill.falloff < 0) errors.push(`Hill ${hill.id} falloff must be 0 or greater.`);
  });

  return errors;
}

function validateAreaShape(shape: AreaShape, label: string, errors: string[]): void {
  if (shape.type === "rectangle" && (shape.size[0] <= 0 || shape.size[1] <= 0)) errors.push(`${label} rectangle needs positive size.`);
  if (shape.type === "circle" && shape.radius <= 0) errors.push(`${label} circle needs positive radius.`);
  if (shape.type === "polygon") {
    if (shape.points.length < 3) errors.push(`${label} polygon needs at least three points.`);
    if (pointsEqual(shape.points[0], shape.points.at(-1))) errors.push(`${label} polygon should not repeat the first point as the final point.`);
    if (polygonSelfIntersects(shape.points)) errors.push(`${label} polygon edges must not cross non-adjacent edges.`);
  }
}

function validatePathShape(shape: PathShape, label: string, errors: string[]): void {
  if (shape.type === "line" && pointsEqual(shape.start, shape.end)) errors.push(`${label} line needs distinct start and end points.`);
  if (shape.type === "polyline" && shape.points.length < 2) errors.push(`${label} polyline needs at least two points.`);
  if (shape.type === "cubicBezierPath" && shape.curves.length === 0) errors.push(`${label} Bezier path needs at least one curve.`);
}

function validateAreaSemantics(area: Area, errors: string[]): void {
  if (area.composition !== undefined && area.composition !== "replace" && area.composition !== "additive") errors.push(`Area ${area.id} has invalid composition ${area.composition}.`);
  if (area.role !== undefined && area.role !== "background" && area.role !== "lawn" && area.role !== "bed") errors.push(`Area ${area.id} has invalid role ${area.role}.`);
  if (area.surface !== undefined && area.surface !== "grass" && area.surface !== "dirt") errors.push(`Area ${area.id} has invalid surface ${area.surface}.`);
  if (area.edgeFalloff !== undefined && area.edgeFalloff < 0) errors.push(`Area ${area.id} edgeFalloff must be 0 or greater.`);
}

function validateDistribution(distribution: Distribution, label: string, errors: string[]): void {
  if (distribution.density < 0) errors.push(`${label} density must be 0 or greater.`);
  if (distribution.type === "perlin") {
    if (distribution.noise.octaves.length === 0) errors.push(`${label} Perlin distribution needs at least one octave.`);
    if (distribution.noise.threshold < 0 || distribution.noise.threshold > 1) errors.push(`${label} Perlin threshold should be between 0 and 1.`);
    if (distribution.noise.softness < 0) errors.push(`${label} Perlin softness must be 0 or greater.`);
  }
}

function validateAuthoredId(id: string, label: string, errors: string[]): void {
  if (id.trim() && !/^[A-Za-z]/.test(id)) errors.push(`${label} id should start with a simple Latin alphabetic character.`);
}

function pointsEqual(a?: Point2, b?: Point2): boolean {
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

function polygonSelfIntersects(points: Point2[]): boolean {
  for (let index = 0; index < points.length; index++) {
    const a1 = points[index];
    const a2 = points[(index + 1) % points.length];
    for (let otherIndex = index + 1; otherIndex < points.length; otherIndex++) {
      if (Math.abs(index - otherIndex) <= 1) continue;
      if (index === 0 && otherIndex === points.length - 1) continue;
      const b1 = points[otherIndex];
      const b2 = points[(otherIndex + 1) % points.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(a1: Point2, a2: Point2, b1: Point2, b2: Point2): boolean {
  const d1 = direction(a1, a2, b1);
  const d2 = direction(a1, a2, b2);
  const d3 = direction(b1, b2, a1);
  const d4 = direction(b1, b2, a2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function direction(a: Point2, b: Point2, c: Point2): number {
  return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}
