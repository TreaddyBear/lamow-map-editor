import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { moveAreaShapeHandle, movePathShapeHandle } from "../domain/editHandles";
import type { LevelV1, Point2, Rect, Selection } from "../domain/model";
import type { CanvasTool, PendingPathState } from "../domain/model";
import { closestSelectionPoint, snapMoveDelta, snapPoint } from "../domain/snapping";
import type { SnapSettings } from "../editor/types";
import { moveSelection, round, sameSelection, updateArray, updateAreasAtPath } from "../editor/utils";
import { AreaSvg, HillSvg, PathSvg } from "./viewport/MapObjects";
import { SelectionHandles } from "./viewport/SelectionHandles";
import { applyLiveDrag, applySelectedGeometryPreview, clearLiveDrag } from "./viewport/sceneController";
import { Button } from "./ui";

type LiveDragState = {
  selection: Selection;
  start: Point2;
  anchor: Point2 | null;
  last: Point2;
  dx: number;
  dz: number;
  moved: boolean;
};

type LiveEditHandleDragState = {
  selection: Selection;
  handle: string;
  index?: number;
  start: Point2;
  last: Point2;
  previewLevel: LevelV1;
  moved: boolean;
};

type PanState = {
  pointerId: number;
  startClient: [number, number];
  startViewBox: Rect;
} | null;

type Props = {
  level: LevelV1;
  bounds: Rect;
  selection: Selection;
  canvasTool: CanvasTool;
  pendingPath: PendingPathState;
  snap: SnapSettings;
  onSelect: (selection: Selection) => void;
  onClearSelection: () => void;
  onUpdateLevel: (updater: (level: LevelV1) => LevelV1, historyEntry?: boolean) => void;
  onContextMenu: (screenX: number, screenY: number, world: Point2, target?: Selection) => void;
  onAddArea: (point: Point2, parentPath?: number[]) => void;
  onAddHill: (point: Point2) => void;
  onPathToolClick: (kind: "fence" | "road" | "dirtPath", point: Point2) => void;
  onFreezeViewport: () => void;
  onReleaseViewport: () => void;
};

export function Viewport(props: Props) {
  const { level, bounds } = props;
  const liveDragRef = useRef<LiveDragState | null>(null);
  const liveEditHandleDragRef = useRef<LiveEditHandleDragState | null>(null);
  const panRef = useRef<PanState>(null);
  const [viewBox, setViewBox] = useState(bounds);
  const width = Math.max(1, viewBox.xMax - viewBox.xMin);
  const height = Math.max(1, viewBox.zMax - viewBox.zMin);
  const gridStep = props.snap.enabled ? Math.max(0.1, Number(props.snap.increment) || 1) : autoGridStep(width);

  const eventToWorld = (svg: SVGSVGElement, event: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement> | ReactWheelEvent<SVGSVGElement>): Point2 | null => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    return [round(local.x), round(local.y)];
  };

  const targetSelection = (target: EventTarget | null): Selection | null => {
    const element = target instanceof Element ? target.closest("[data-select-kind]") : null;
    if (!element) return null;
    const kind = element.getAttribute("data-select-kind") as Selection["kind"] | null;
    if (!kind) return null;
    const path = element.getAttribute("data-select-path")?.split(".").map(Number).filter(Number.isInteger);
    const indexText = element.getAttribute("data-select-index");
    return { kind, path, index: indexText === null ? undefined : Number(indexText) };
  };

  return (
    <>
    <svg
      id="map-svg"
      className="map-board"
      viewBox={`${viewBox.xMin} ${viewBox.zMin} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = { pointerId: event.pointerId, startClient: [event.clientX, event.clientY], startViewBox: viewBox };
          return;
        }
        if (event.button !== 0) return;
        const world = eventToWorld(event.currentTarget, event);
        if (!world) return;
        const snappedWorld = props.snap.enabled ? snapPoint(world, props.snap) : world;
        const handleElement = event.target instanceof Element ? event.target.closest("[data-handle]") as HTMLElement | null : null;
        if (handleElement) {
          event.currentTarget.setPointerCapture(event.pointerId);
          liveEditHandleDragRef.current = { selection: structuredClone(props.selection), handle: handleElement.dataset.handle ?? "", index: handleElement.dataset.handleIndex === undefined ? undefined : Number(handleElement.dataset.handleIndex), start: world, last: props.snap.enabled ? snappedWorld : world, previewLevel: structuredClone(level), moved: false };
          props.onFreezeViewport();
          return;
        }
        if (props.canvasTool === "spawn") {
          props.onSelect({ kind: "spawn" });
          props.onUpdateLevel((current) => ({ ...current, spawn: { ...current.spawn, position: snappedWorld } }), true);
          return;
        }
        if (props.canvasTool === "area") return props.onAddArea(snappedWorld, props.selection.kind === "area" ? props.selection.path : undefined);
        if (props.canvasTool === "hill") return props.onAddHill(snappedWorld);
        if (props.canvasTool === "fence" || props.canvasTool === "road" || props.canvasTool === "dirtPath") return props.onPathToolClick(props.canvasTool, snappedWorld);
        const target = targetSelection(event.target);
        const nearbyTarget = target ?? nearestTargetSelection(event.currentTarget, event.clientX, event.clientY);
        if (nearbyTarget) {
          const target = nearbyTarget;
          props.onSelect(target);
          liveDragRef.current = { selection: target, start: world, anchor: closestSelectionPoint(level, target, world), last: world, dx: 0, dz: 0, moved: false };
          props.onFreezeViewport();
          return;
        }
        props.onClearSelection();
      }}
      onPointerMove={(event) => {
        if (panRef.current) {
          const pan = panRef.current;
          const scaleX = (pan.startViewBox.xMax - pan.startViewBox.xMin) / Math.max(1, event.currentTarget.clientWidth);
          const scaleZ = (pan.startViewBox.zMax - pan.startViewBox.zMin) / Math.max(1, event.currentTarget.clientHeight);
          const dx = (event.clientX - pan.startClient[0]) * scaleX;
          const dz = (event.clientY - pan.startClient[1]) * scaleZ;
          setViewBox(translateRect(pan.startViewBox, -dx, -dz));
          return;
        }
        const world = eventToWorld(event.currentTarget, event);
        if (!world) return;
        if (liveEditHandleDragRef.current) {
          const drag = liveEditHandleDragRef.current;
          const target = snapHandleTarget(world, drag.start, props.snap);
          const dx = round(target[0] - drag.last[0]);
          const dz = round(target[1] - drag.last[1]);
          if (dx === 0 && dz === 0) return;
          const previewLevel = moveEditHandle(drag.previewLevel, drag.selection, drag.handle, drag.index, target, dx, dz);
          liveEditHandleDragRef.current = { ...drag, last: target, previewLevel, moved: true };
          applySelectedGeometryPreview(event.currentTarget, previewLevel, drag.selection);
          return;
        }
        if (liveDragRef.current) {
          const drag = liveDragRef.current;
          const rawDelta: Point2 = [round(world[0] - drag.start[0]), round(world[1] - drag.start[1])];
          const [dx, dz] = snapMoveDelta(rawDelta, drag.anchor, props.snap);
          if (dx === drag.dx && dz === drag.dz) return;
          liveDragRef.current = { ...drag, last: world, dx, dz, moved: dx !== 0 || dz !== 0 };
          applyLiveDrag(event.currentTarget, drag.selection, dx, dz, dx !== 0 || dz !== 0);
        }
      }}
      onPointerUp={(event) => {
        if (panRef.current?.pointerId === event.pointerId) {
          panRef.current = null;
          return;
        }
        const drag = liveDragRef.current;
        if (drag?.moved) {
          clearLiveDrag(event.currentTarget, drag.selection);
          props.onUpdateLevel((current) => moveSelection(current, drag.selection, drag.dx, drag.dz), true);
        }
        const handleDrag = liveEditHandleDragRef.current;
        if (handleDrag?.moved) props.onUpdateLevel(() => handleDrag.previewLevel, true);
        liveDragRef.current = null;
        liveEditHandleDragRef.current = null;
        props.onReleaseViewport();
      }}
      onPointerCancel={(event) => {
        if (panRef.current?.pointerId === event.pointerId) {
          panRef.current = null;
          return;
        }
        if (liveDragRef.current) clearLiveDrag(event.currentTarget, liveDragRef.current.selection);
        if (liveEditHandleDragRef.current) applySelectedGeometryPreview(event.currentTarget, level, liveEditHandleDragRef.current.selection);
        liveDragRef.current = null;
        liveEditHandleDragRef.current = null;
        props.onReleaseViewport();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const world = eventToWorld(event.currentTarget, event);
        if (!world) return;
        props.onContextMenu(event.clientX, event.clientY, world, targetSelection(event.target) ?? undefined);
      }}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onWheel={(event) => {
        event.preventDefault();
        const world = eventToWorld(event.currentTarget, event);
        if (!world) return;
        setViewBox((current) => zoomRectAt(current, world, event.deltaY > 0 ? 1.14 : 0.88));
      }}
    >
      <defs>
        <pattern id="grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
          <path d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`} fill="none" stroke="var(--map-grid)" strokeWidth={Math.max(gridStep * 0.025, width / 1200)} />
        </pattern>
      </defs>
      <rect x={viewBox.xMin} y={viewBox.zMin} width={width} height={height} fill="url(#grid)" />
      {level.areas.map((area, index) => <AreaSvg key={`${area.id}-${index}`} area={area} path={[index]} selection={props.selection} />)}
      {level.terrain.heightFeatures.map((hill, index) => <HillSvg key={hill.id} hill={hill} index={index} selection={props.selection} />)}
      {level.roads.map((road, index) => <PathSvg key={road.id} shape={road.shape} item={{ kind: "road", index }} selection={props.selection} color="var(--map-road-stroke)" width={road.width} className="road" />)}
      {level.dirtPaths.map((path, index) => <PathSvg key={path.id} shape={path.shape} item={{ kind: "dirtPath", index }} selection={props.selection} color="var(--map-path-stroke)" width={path.width} className="dirt" />)}
      {level.fences.map((fence, index) => <PathSvg key={fence.id} shape={fence.shape} item={{ kind: "fence", index }} selection={props.selection} color="var(--map-fence-stroke)" width={0.24} className="fence" />)}
      {props.pendingPath ? <circle cx={props.pendingPath.start[0]} cy={props.pendingPath.start[1]} r="0.3" fill="var(--map-selection)" stroke="var(--map-empty-fill)" strokeWidth="0.08" /> : null}
      <g data-selection-key="spawn::" data-select-kind="spawn" className={`map-object ${sameSelection(props.selection, { kind: "spawn" }) ? "selected-object" : ""}`} transform={`translate(${level.spawn.position[0]} ${level.spawn.position[1]}) rotate(${level.spawn.headingDegrees})`}>
        <circle r="0.38" fill="var(--map-empty-fill)" stroke="var(--map-selection)" strokeWidth="0.1" />
        <path d="M -0.18 0.15 L 0 -0.22 L 0.18 0.15 Z" fill="var(--map-selection)" />
      </g>
      <SelectionHandles level={level} selection={props.selection} viewBox={viewBox} />
    </svg>
    <div className="absolute bottom-7 right-[calc(1.75rem+12rem+1.75rem)] z-10 flex gap-1.5 rounded-lg border border-[var(--surface-border)] bg-[color-mix(in_srgb,var(--surface-bg)_94%,transparent)] p-1.5 shadow-[0_8px_22px_rgb(31_49_27_/_12%)]">
      <Button size="compact" type="button" onClick={() => setViewBox((current) => zoomRectAt(current, rectCenter(current), 0.82))}>+</Button>
      <Button size="compact" type="button" onClick={() => setViewBox((current) => zoomRectAt(current, rectCenter(current), 1.18))}>-</Button>
      <Button size="compact" type="button" onClick={() => setViewBox(bounds)}>Fit</Button>
    </div>
    <svg
      className="absolute bottom-7 right-7 z-10 h-32 w-48 cursor-pointer rounded-lg border border-[var(--input-border)] bg-[var(--surface-bg)] shadow-[0_8px_22px_rgb(31_49_27_/_12%)]"
      viewBox={`${bounds.xMin} ${bounds.zMin} ${Math.max(1, bounds.xMax - bounds.xMin)} ${Math.max(1, bounds.zMax - bounds.zMin)}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={(event) => {
        const point = eventToWorld(event.currentTarget, event);
        if (!point) return;
        setViewBox((current) => centerRectOn(current, point));
      }}
    >
      <rect x={bounds.xMin} y={bounds.zMin} width={Math.max(1, bounds.xMax - bounds.xMin)} height={Math.max(1, bounds.zMax - bounds.zMin)} className="minimap-bg" />
      {level.areas.map((area, index) => <AreaSvg key={`${area.id}-${index}`} area={area} path={[index]} selection={{ kind: "level" }} />)}
      <rect className="minimap-view" x={viewBox.xMin} y={viewBox.zMin} width={width} height={height} />
    </svg>
    </>
  );
}

function rectCenter(rect: Rect): Point2 {
  return [(rect.xMin + rect.xMax) / 2, (rect.zMin + rect.zMax) / 2];
}

function translateRect(rect: Rect, dx: number, dz: number): Rect {
  return { xMin: rect.xMin + dx, xMax: rect.xMax + dx, zMin: rect.zMin + dz, zMax: rect.zMax + dz };
}

function centerRectOn(rect: Rect, point: Point2): Rect {
  const width = rect.xMax - rect.xMin;
  const height = rect.zMax - rect.zMin;
  return { xMin: point[0] - width / 2, xMax: point[0] + width / 2, zMin: point[1] - height / 2, zMax: point[1] + height / 2 };
}

function zoomRectAt(rect: Rect, point: Point2, factor: number): Rect {
  const width = (rect.xMax - rect.xMin) * factor;
  const height = (rect.zMax - rect.zMin) * factor;
  const leftRatio = (point[0] - rect.xMin) / Math.max(0.001, rect.xMax - rect.xMin);
  const topRatio = (point[1] - rect.zMin) / Math.max(0.001, rect.zMax - rect.zMin);
  return {
    xMin: point[0] - width * leftRatio,
    xMax: point[0] + width * (1 - leftRatio),
    zMin: point[1] - height * topRatio,
    zMax: point[1] + height * (1 - topRatio),
  };
}

function autoGridStep(viewWidth: number): number {
  const raw = viewWidth / 24;
  const power = 10 ** Math.floor(Math.log10(Math.max(0.001, raw)));
  const normalized = raw / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * power;
}

function nearestTargetSelection(svg: SVGSVGElement, clientX: number, clientY: number): Selection | null {
  const candidates = Array.from(svg.querySelectorAll<SVGGraphicsElement>("[data-select-kind]")).map((element) => {
    const selection = targetSelectionFromElement(element);
    if (!selection) return null;
    const distance = screenDistanceToElement(element, clientX, clientY);
    return Number.isFinite(distance) ? { selection, distance } : null;
  }).filter((item): item is { selection: Selection; distance: number } => Boolean(item));
  const closest = candidates.sort((a, b) => a.distance - b.distance)[0];
  return closest && closest.distance <= 14 ? closest.selection : null;
}

function targetSelectionFromElement(element: Element): Selection | null {
  const kind = element.getAttribute("data-select-kind") as Selection["kind"] | null;
  if (!kind) return null;
  const path = element.getAttribute("data-select-path")?.split(".").map(Number).filter(Number.isInteger);
  const indexText = element.getAttribute("data-select-index");
  return { kind, path, index: indexText === null ? undefined : Number(indexText) };
}

function screenDistanceToElement(element: SVGGraphicsElement, clientX: number, clientY: number): number {
  try {
    const box = element.getBBox();
    const ctm = element.getScreenCTM();
    if (!ctm) return Number.POSITIVE_INFINITY;
    const points = [
      new DOMPoint(box.x, box.y).matrixTransform(ctm),
      new DOMPoint(box.x + box.width, box.y).matrixTransform(ctm),
      new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(ctm),
      new DOMPoint(box.x, box.y + box.height).matrixTransform(ctm),
    ];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const dx = Math.max(Math.min(...xs) - clientX, 0, clientX - Math.max(...xs));
    const dy = Math.max(Math.min(...ys) - clientY, 0, clientY - Math.max(...ys));
    return Math.hypot(dx, dy);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function snapHandleTarget(world: Point2, start: Point2, snap: SnapSettings): Point2 {
  if (!snap.enabled) return world;
  if (snap.mode === "toGrid") return snapPoint(world, snap);
  const rawDelta: Point2 = [round(world[0] - start[0]), round(world[1] - start[1])];
  const delta = snapMoveDelta(rawDelta, null, snap);
  return [round(start[0] + delta[0]), round(start[1] + delta[1])];
}

function moveEditHandle(level: LevelV1, item: Selection, handle: string, index: number | undefined, world: Point2, dx: number, dz: number): LevelV1 {
  if (item.kind === "spawn") {
    const [x, z] = level.spawn.position;
    return { ...level, spawn: { ...level.spawn, headingDegrees: round(Math.atan2(world[1] - z, world[0] - x) * (180 / Math.PI)) } };
  }
  if (item.kind === "area" && item.path) return { ...level, areas: updateAreasAtPath(level.areas, item.path, (area) => ({ ...area, shape: moveAreaShapeHandle(area.shape, handle, index, world, dx, dz) })) };
  if (item.kind === "heightFeature" && item.index !== undefined) return { ...level, terrain: { heightFeatures: updateArray(level.terrain.heightFeatures, item.index, { ...level.terrain.heightFeatures[item.index], shape: moveAreaShapeHandle(level.terrain.heightFeatures[item.index].shape, handle, index, world, dx, dz) }) } };
  if (item.kind === "road" && item.index !== undefined) return { ...level, roads: updateArray(level.roads, item.index, { ...level.roads[item.index], shape: movePathShapeHandle(level.roads[item.index].shape, handle, index, world, dx, dz) }) };
  if (item.kind === "dirtPath" && item.index !== undefined) return { ...level, dirtPaths: updateArray(level.dirtPaths, item.index, { ...level.dirtPaths[item.index], shape: movePathShapeHandle(level.dirtPaths[item.index].shape, handle, index, world, dx, dz) }) };
  if (item.kind === "fence" && item.index !== undefined) return { ...level, fences: updateArray(level.fences, item.index, { ...level.fences[item.index], shape: movePathShapeHandle(level.fences[item.index].shape, handle, index, world, dx, dz) }) };
  return level;
}
