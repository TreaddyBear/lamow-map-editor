import { rectFromCenter } from "../../domain/geometry";
import type { AreaShape, LevelV1, PathShape, Selection } from "../../domain/model";
import { getAreaByPath } from "../../editor/utils";
import { selectionHandlePrimitives } from "./handlePrimitives";
import { selectionKey } from "./svgHelpers";

export function applySelectedGeometryPreview(svg: SVGSVGElement, level: LevelV1, selection: Selection) {
  if (selection.kind === "spawn") {
    const element = findSelectionElement(svg, selection);
    element?.setAttribute("transform", `translate(${level.spawn.position[0]} ${level.spawn.position[1]}) rotate(${level.spawn.headingDegrees})`);
  } else if (selection.kind === "area" && selection.path) {
    const area = getAreaByPath(level.areas, selection.path);
    const element = findSelectionShapeElement(svg, selection);
    if (area && element) applyAreaShape(element, area.shape);
  } else if (selection.kind === "heightFeature" && selection.index !== undefined) {
    const feature = level.terrain.heightFeatures[selection.index];
    const element = findSelectionShapeElement(svg, selection);
    if (feature && element) applyAreaShape(element, feature.shape);
  } else if (selection.kind === "road" && selection.index !== undefined) {
    applyPathShape(findSelectionShapeElement(svg, selection), level.roads[selection.index]?.shape);
  } else if (selection.kind === "dirtPath" && selection.index !== undefined) {
    applyPathShape(findSelectionShapeElement(svg, selection), level.dirtPaths[selection.index]?.shape);
  } else if (selection.kind === "fence" && selection.index !== undefined) {
    applyPathShape(findSelectionShapeElement(svg, selection), level.fences[selection.index]?.shape);
  }
  renderHandlePreview(svg, level, selection);
}

export function renderHandlePreview(svg: SVGSVGElement, level: LevelV1, selection: Selection) {
  const handles = svg.querySelector<SVGGElement>(".edit-handles");
  if (!handles) return;
  renderHandlesInto(handles, level, selection);
}

export function renderHandlesInto(handles: SVGGElement, level: LevelV1, selection: Selection) {
  const svg = handles.ownerSVGElement;
  if (!svg) return;
  const scale = handleScale(svg);
  handles.replaceChildren(...selectionHandlePrimitives(level, selection).map((primitive) => {
    if (primitive.kind === "guide") {
      return svgElement("line", { class: "edit-handle-guide", x1: primitive.start[0], y1: primitive.start[1], x2: primitive.end[0], y2: primitive.end[1] });
    }
    const group = svgElement("g", { class: "edit-handle-node", "data-handle": primitive.handle, "data-handle-index": primitive.index });
    group.append(
      svgElement("circle", { class: "edit-handle-hit", cx: primitive.point[0], cy: primitive.point[1], r: (primitive.anchor ? 11 : 9) * scale }),
      svgElement("circle", { class: `edit-handle ${primitive.anchor ? "anchor" : ""}`, cx: primitive.point[0], cy: primitive.point[1], r: (primitive.anchor ? 5.5 : 4.5) * scale }),
    );
    return group;
  }));
}

export function applyLiveDrag(svg: SVGSVGElement, selection: Selection, dx: number, dz: number, moved: boolean) {
  const transform = moved ? `translate(${dx} ${dz})` : "";
  setLiveTransform(findSelectionElement(svg, selection), transform);
  setLiveTransform(svg.querySelector<SVGGElement>(".edit-handles") ?? undefined, transform);
}

export function clearLiveDrag(svg: SVGSVGElement, selection: Selection) {
  restoreLiveTransform(findSelectionElement(svg, selection));
  restoreLiveTransform(svg.querySelector<SVGGElement>(".edit-handles") ?? undefined);
}

function applyAreaShape(element: SVGGraphicsElement, shape: AreaShape) {
  clearGeometryAttrs(element);
  if (shape.type === "circle" && element instanceof SVGCircleElement) {
    element.setAttribute("cx", String(shape.center[0]));
    element.setAttribute("cy", String(shape.center[1]));
    element.setAttribute("r", String(shape.radius));
    return;
  }
  if (shape.type === "polygon" && element instanceof SVGPolygonElement) {
    element.setAttribute("points", shape.points.map((point) => `${point[0]},${point[1]}`).join(" "));
    return;
  }
  if (shape.type === "rectangle" && element instanceof SVGRectElement) {
    const rect = rectFromCenter(shape.center, shape.size);
    element.setAttribute("x", String(rect.xMin));
    element.setAttribute("y", String(rect.zMin));
    element.setAttribute("width", String(rect.xMax - rect.xMin));
    element.setAttribute("height", String(rect.zMax - rect.zMin));
    if (shape.rotationDegrees) element.setAttribute("transform", `rotate(${shape.rotationDegrees} ${shape.center[0]} ${shape.center[1]})`);
  }
}

function applyPathShape(element: SVGGraphicsElement | undefined, shape?: PathShape) {
  if (!element || !shape) return;
  clearGeometryAttrs(element);
  if (shape.type === "line" && element instanceof SVGLineElement) {
    element.setAttribute("x1", String(shape.start[0]));
    element.setAttribute("y1", String(shape.start[1]));
    element.setAttribute("x2", String(shape.end[0]));
    element.setAttribute("y2", String(shape.end[1]));
    return;
  }
  if (shape.type === "polyline" && element instanceof SVGPolylineElement) {
    element.setAttribute("points", shape.points.map((point) => `${point[0]},${point[1]}`).join(" "));
    return;
  }
  if (shape.type === "cubicBezierPath" && element instanceof SVGPathElement) {
    element.setAttribute("d", `M ${shape.start[0]} ${shape.start[1]} ${shape.curves.map((curve) => `C ${curve.c1[0]} ${curve.c1[1]}, ${curve.c2[0]} ${curve.c2[1]}, ${curve.end[0]} ${curve.end[1]}`).join(" ")}`);
  }
}

function clearGeometryAttrs(element: SVGGraphicsElement) {
  for (const attr of ["x", "y", "width", "height", "cx", "cy", "r", "points", "d", "x1", "y1", "x2", "y2", "transform"]) element.removeAttribute(attr);
}

function findSelectionShapeElement(svg: SVGSVGElement, selection: Selection): SVGGraphicsElement | undefined {
  const element = findSelectionElement(svg, selection);
  if (!element) return undefined;
  if (element instanceof SVGGElement) return element.querySelector<SVGGraphicsElement>(":scope > circle, :scope > polygon, :scope > rect, :scope > line, :scope > polyline, :scope > path") ?? undefined;
  return element;
}

function findSelectionElement(svg: SVGSVGElement, selection: Selection): SVGGraphicsElement | undefined {
  const key = selectionKey(selection);
  return Array.from(svg.querySelectorAll<SVGGraphicsElement>("[data-selection-key]")).find((element) => element.dataset.selectionKey === key);
}

function setLiveTransform(element: SVGGraphicsElement | undefined, transform: string) {
  if (!element) return;
  if (element.dataset.liveBaseTransform === undefined) element.dataset.liveBaseTransform = element.getAttribute("transform") ?? "";
  const base = element.dataset.liveBaseTransform;
  const next = [transform, base].filter(Boolean).join(" ");
  if (next) element.setAttribute("transform", next);
  else element.removeAttribute("transform");
}

function restoreLiveTransform(element: SVGGraphicsElement | undefined) {
  if (!element || element.dataset.liveBaseTransform === undefined) return;
  const base = element.dataset.liveBaseTransform;
  if (base) element.setAttribute("transform", base);
  else element.removeAttribute("transform");
  delete element.dataset.liveBaseTransform;
}

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K, attrs: Record<string, string | number | undefined>): SVGElementTagNameMap[K] {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) element.setAttribute(key, String(value));
  }
  return element;
}

function handleScale(svg: SVGSVGElement): number {
  const viewBox = svg.viewBox.baseVal;
  const width = svg.clientWidth || 1;
  return Math.max(0.001, viewBox.width / width);
}
