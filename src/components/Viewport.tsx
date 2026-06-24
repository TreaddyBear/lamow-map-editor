import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { moveAreaShapeHandle, movePathShapeHandle } from "../domain/editHandles";
import type { LevelV1, Point2, Rect, Selection } from "../domain/model";
import type { CanvasTool, PendingPathState } from "../domain/model";
import type { DragState, EditHandleDragState } from "../editor/types";
import { moveSelection, round, sameSelection, updateArray, updateAreasAtPath } from "../editor/utils";
import { AreaSvg, HillSvg, PathSvg } from "./viewport/MapObjects";
import { SelectionHandles } from "./viewport/SelectionHandles";

type Props = {
  level: LevelV1;
  bounds: Rect;
  selection: Selection;
  canvasTool: CanvasTool;
  pendingPath: PendingPathState;
  dragState: DragState;
  editHandleDragState: EditHandleDragState;
  onSelect: (selection: Selection) => void;
  onClearSelection: () => void;
  onUpdateLevel: (updater: (level: LevelV1) => LevelV1) => void;
  onDragState: (state: DragState) => void;
  onEditHandleDragState: (state: EditHandleDragState) => void;
  onContextMenu: (screenX: number, screenY: number, world: Point2, target?: Selection) => void;
  onAddArea: (point: Point2, parentPath?: number[]) => void;
  onAddHill: (point: Point2) => void;
  onPathToolClick: (kind: "fence" | "road" | "dirtPath", point: Point2) => void;
  onFreezeViewport: () => void;
  onReleaseViewport: () => void;
};

export function Viewport(props: Props) {
  const { level, bounds } = props;
  const width = Math.max(1, bounds.xMax - bounds.xMin);
  const height = Math.max(1, bounds.zMax - bounds.zMin);

  const eventToWorld = (svg: SVGSVGElement, event: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>): Point2 | null => {
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
    <svg
      id="map-svg"
      className="map-board"
      viewBox={`${bounds.xMin} ${bounds.zMin} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const world = eventToWorld(event.currentTarget, event);
        if (!world) return;
        const handleElement = event.target instanceof Element ? event.target.closest("[data-handle]") as HTMLElement | null : null;
        if (handleElement) {
          event.currentTarget.setPointerCapture(event.pointerId);
          props.onEditHandleDragState({ selection: structuredClone(props.selection), handle: handleElement.dataset.handle ?? "", index: handleElement.dataset.handleIndex === undefined ? undefined : Number(handleElement.dataset.handleIndex), last: world, moved: false });
          props.onFreezeViewport();
          return;
        }
        if (props.canvasTool === "spawn") {
          props.onSelect({ kind: "spawn" });
          props.onUpdateLevel((current) => ({ ...current, spawn: { ...current.spawn, position: world } }));
          return;
        }
        if (props.canvasTool === "area") return props.onAddArea(world, props.selection.kind === "area" ? props.selection.path : undefined);
        if (props.canvasTool === "hill") return props.onAddHill(world);
        if (props.canvasTool === "fence" || props.canvasTool === "road" || props.canvasTool === "dirtPath") return props.onPathToolClick(props.canvasTool, world);
        const target = targetSelection(event.target);
        if (target) {
          props.onSelect(target);
          props.onDragState({ selection: target, last: world, moved: false });
          props.onFreezeViewport();
          return;
        }
        props.onClearSelection();
      }}
      onPointerMove={(event) => {
        const world = eventToWorld(event.currentTarget, event);
        if (!world) return;
        if (props.editHandleDragState) {
          const drag = props.editHandleDragState;
          const dx = round(world[0] - drag.last[0]);
          const dz = round(world[1] - drag.last[1]);
          if (dx === 0 && dz === 0) return;
          props.onUpdateLevel((current) => moveEditHandle(current, drag.selection, drag.handle, drag.index, world, dx, dz));
          props.onEditHandleDragState({ ...drag, last: world, moved: true });
          return;
        }
        if (props.dragState) {
          const drag = props.dragState;
          const dx = round(world[0] - drag.last[0]);
          const dz = round(world[1] - drag.last[1]);
          if (dx === 0 && dz === 0) return;
          props.onUpdateLevel((current) => moveSelection(current, drag.selection, dx, dz));
          props.onDragState({ ...drag, last: world, moved: true });
        }
      }}
      onPointerUp={() => {
        props.onDragState(null);
        props.onEditHandleDragState(null);
        props.onReleaseViewport();
      }}
      onPointerCancel={() => {
        props.onDragState(null);
        props.onEditHandleDragState(null);
        props.onReleaseViewport();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const world = eventToWorld(event.currentTarget, event);
        if (!world) return;
        props.onContextMenu(event.clientX, event.clientY, world, targetSelection(event.target) ?? undefined);
      }}
    >
      <defs>
        <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#b8c8b2" strokeWidth="0.025" />
        </pattern>
      </defs>
      <rect x={bounds.xMin} y={bounds.zMin} width={width} height={height} fill="url(#grid)" />
      {level.areas.map((area, index) => <AreaSvg key={`${area.id}-${index}`} area={area} path={[index]} selection={props.selection} />)}
      {level.terrain.heightFeatures.map((hill, index) => <HillSvg key={hill.id} hill={hill} index={index} selection={props.selection} />)}
      {level.roads.map((road, index) => <PathSvg key={road.id} shape={road.shape} item={{ kind: "road", index }} selection={props.selection} color="#6c7177" width={road.width} className="road" />)}
      {level.dirtPaths.map((path, index) => <PathSvg key={path.id} shape={path.shape} item={{ kind: "dirtPath", index }} selection={props.selection} color="#9a6a43" width={path.width} className="dirt" />)}
      {level.fences.map((fence, index) => <PathSvg key={fence.id} shape={fence.shape} item={{ kind: "fence", index }} selection={props.selection} color="#6f482e" width={0.24} className="fence" />)}
      {props.pendingPath ? <circle cx={props.pendingPath.start[0]} cy={props.pendingPath.start[1]} r="0.3" fill="#1d4ed8" stroke="#ffffff" strokeWidth="0.08" /> : null}
      <g data-select-kind="spawn" className={`map-object ${sameSelection(props.selection, { kind: "spawn" }) ? "selected-object" : ""}`} transform={`translate(${level.spawn.position[0]} ${level.spawn.position[1]}) rotate(${level.spawn.headingDegrees})`}>
        <circle r="0.38" fill="#ffffff" stroke="#1d4ed8" strokeWidth="0.1" />
        <path d="M -0.18 0.15 L 0 -0.22 L 0.18 0.15 Z" fill="#1d4ed8" />
      </g>
      <SelectionHandles level={level} selection={props.selection} />
    </svg>
  );
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
