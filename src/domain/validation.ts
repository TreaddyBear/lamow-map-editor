import { rectContainsRect, rectsOverlap, shapeBounds } from "./geometry";
import type { Area, AreaShape, LevelV1, MapPackV1, PathShape } from "./model";

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
  if (!currentPack.pack.prefix.trim()) errors.push("Pack prefix is required.");
  if (!/^[A-Za-z]/.test(currentPack.pack.prefix)) errors.push("Pack prefix should start with a simple Latin alphabetic character.");
  if (!level.code.trim()) errors.push("Level code is required.");
  if (!/^[A-Za-z]/.test(level.code)) errors.push("Level code should start with a simple Latin alphabetic character.");
  if (!level.name.trim()) errors.push("Level name is required.");
  if (level.parSeconds <= 0) errors.push("Par seconds must be greater than 0.");
  if (level.areas.length === 0) errors.push("Add at least one area.");

  const matchingCodes = currentPack.levels.filter((item) => item.code.toLowerCase() === level.code.toLowerCase());
  if (matchingCodes.length > 1) errors.push(`Level code ${level.code} appears more than once in this pack.`);

  const idCounts = new Map<string, number>();
  collectAuthoredIds(level).forEach((id) => idCounts.set(id.toLowerCase(), (idCounts.get(id.toLowerCase()) ?? 0) + 1));
  [...idCounts.entries()].forEach(([id, count]) => {
    if (count > 1) errors.push(`Duplicate authored id in level: ${id}.`);
  });

  const visitArea = (area: Area, path: number[], parent?: Area): void => {
    if (!area.id.trim()) errors.push(`Area ${pathKey(path)} needs an id.`);
    validateAreaShape(area.shape, `Area ${area.id}`, errors);
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

  level.roads.forEach((road) => validatePathShape(road.shape, `Road ${road.id}`, errors));
  level.dirtPaths.forEach((path) => validatePathShape(path.shape, `Dirt path ${path.id}`, errors));
  level.fences.forEach((fence) => validatePathShape(fence.shape, `Fence ${fence.id}`, errors));
  level.terrain.heightFeatures.forEach((hill) => validateAreaShape(hill.shape, `Hill ${hill.id}`, errors));

  return errors;
}

function validateAreaShape(shape: AreaShape, label: string, errors: string[]): void {
  if (shape.type === "rectangle" && (shape.size[0] <= 0 || shape.size[1] <= 0)) errors.push(`${label} rectangle needs positive size.`);
  if (shape.type === "circle" && shape.radius <= 0) errors.push(`${label} circle needs positive radius.`);
  if (shape.type === "polygon" && shape.points.length < 3) errors.push(`${label} polygon needs at least three points.`);
}

function validatePathShape(shape: PathShape, label: string, errors: string[]): void {
  if (shape.type === "polyline" && shape.points.length < 2) errors.push(`${label} polyline needs at least two points.`);
  if (shape.type === "cubicBezierPath" && shape.curves.length === 0) errors.push(`${label} Bezier path needs at least one curve.`);
}
