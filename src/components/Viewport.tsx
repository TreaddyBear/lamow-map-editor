import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { moveAreaShapeHandle, movePathShapeHandle } from "../domain/editHandles";
import { rectFromCenter } from "../domain/geometry";
import type { Area, AreaShape, HeightFeature, LevelV1, PathShape, Point2, Rect, Selection } from "../domain/model";
import type { CanvasTool, PendingPathState } from "../domain/model";
import type { DragState, EditHandleDragState } from "../editor/types";
import { getAreaByPath, moveSelection, round, sameSelection, updateArray, updateAreasAtPath } from "../editor/utils";

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

function selectAttrs(item: Selection) {
  return { "data-select-kind": item.kind, "data-select-path": item.path?.join("."), "data-select-index": item.index };
}

function AreaSvg({ area, path, selection }: { area: Area; path: number[]; selection: Selection }) {
  const selected = sameSelection(selection, { kind: "area", path });
  const fill = area.role === "bed" || area.surface === "dirt" ? "#8a5d3b" : area.composition === "additive" ? "#e4c94a" : area.role === "background" ? "#9dc58d" : "#69a957";
  const stroke = selected ? "#2563eb" : area.role === "bed" || area.surface === "dirt" ? "#55351f" : area.composition === "additive" ? "#b18f1d" : "#315f2b";
  return (
    <>
      <ShapeSvg shape={area.shape} attrs={{ ...selectAttrs({ kind: "area", path }), className: `map-object ${selected ? "selected-object" : ""}`, fill, opacity: area.composition === "additive" ? 0.42 : area.role === "background" ? 0.24 : 0.68, stroke, strokeWidth: selected ? 0.08 : 0.06 }} />
      {(area.children ?? []).map((child, index) => <AreaSvg key={`${child.id}-${index}`} area={child} path={[...path, index]} selection={selection} />)}
    </>
  );
}

function HillSvg({ hill, index, selection }: { hill: HeightFeature; index: number; selection: Selection }) {
  const selected = sameSelection(selection, { kind: "heightFeature", index });
  return <ShapeSvg shape={hill.shape} attrs={{ ...selectAttrs({ kind: "heightFeature", index }), className: `map-object ${selected ? "selected-object" : ""}`, fill: "#d8d6c8", opacity: 0.42, stroke: selected ? "#2563eb" : "#77715c", strokeWidth: selected ? 0.08 : 0.06, strokeDasharray: "0.4 0.25" }} />;
}

function ShapeSvg({ shape, attrs }: { shape: AreaShape; attrs: React.SVGProps<SVGElement> }) {
  if (shape.type === "circle") return <circle {...attrs as React.SVGProps<SVGCircleElement>} cx={shape.center[0]} cy={shape.center[1]} r={shape.radius} />;
  if (shape.type === "polygon") return <polygon {...attrs as React.SVGProps<SVGPolygonElement>} points={shape.points.map((point) => `${point[0]},${point[1]}`).join(" ")} />;
  const rect = rectFromCenter(shape.center, shape.size);
  return <rect {...attrs as React.SVGProps<SVGRectElement>} x={rect.xMin} y={rect.zMin} width={rect.xMax - rect.xMin} height={rect.zMax - rect.zMin} transform={shape.rotationDegrees ? `rotate(${shape.rotationDegrees} ${shape.center[0]} ${shape.center[1]})` : undefined} />;
}

function PathSvg({ shape, item, selection, color, width, className }: { shape: PathShape; item: Selection; selection: Selection; color: string; width: number; className: string }) {
  const selected = sameSelection(selection, item);
  const attrs = { ...selectAttrs(item), className: `map-object ${className} ${selected ? "selected-object" : ""}`, fill: "none", stroke: selected ? "#2563eb" : color, strokeWidth: selected ? Math.max(width, 0.08) : width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (shape.type === "line") return <line {...attrs} x1={shape.start[0]} y1={shape.start[1]} x2={shape.end[0]} y2={shape.end[1]} />;
  if (shape.type === "polyline") return <polyline {...attrs} points={shape.points.map((point) => `${point[0]},${point[1]}`).join(" ")} />;
  return <path {...attrs} d={`M ${shape.start[0]} ${shape.start[1]} ${shape.curves.map((curve) => `C ${curve.c1[0]} ${curve.c1[1]}, ${curve.c2[0]} ${curve.c2[1]}, ${curve.end[0]} ${curve.end[1]}`).join(" ")}`} />;
}

function SelectionHandles({ level, selection }: { level: LevelV1; selection: Selection }) {
  if (selection.kind === "spawn") {
    const heading = (level.spawn.headingDegrees * Math.PI) / 180;
    const point: Point2 = [round(level.spawn.position[0] + Math.cos(heading) * 1.4), round(level.spawn.position[1] + Math.sin(heading) * 1.4)];
    return <g className="edit-handles"><line className="edit-handle-guide" x1={level.spawn.position[0]} y1={level.spawn.position[1]} x2={point[0]} y2={point[1]} /><Handle point={point} handle="heading" /></g>;
  }
  if (selection.kind === "area" && selection.path) {
    const area = getAreaByPath(level.areas, selection.path);
    return area ? <g className="edit-handles">{areaHandles(area.shape)}</g> : null;
  }
  if (selection.kind === "heightFeature" && selection.index !== undefined) return <g className="edit-handles">{areaHandles(level.terrain.heightFeatures[selection.index]?.shape)}</g>;
  const path = selection.kind === "road" && selection.index !== undefined ? level.roads[selection.index]?.shape : selection.kind === "dirtPath" && selection.index !== undefined ? level.dirtPaths[selection.index]?.shape : selection.kind === "fence" && selection.index !== undefined ? level.fences[selection.index]?.shape : undefined;
  return path ? <g className="edit-handles">{pathHandles(path)}</g> : null;
}

function areaHandles(shape?: AreaShape) {
  if (!shape) return null;
  if (shape.type === "circle") {
    const radiusPoint: Point2 = [round(shape.center[0] + shape.radius), shape.center[1]];
    return <><Handle point={shape.center} handle="center" anchor /><line className="edit-handle-guide" x1={shape.center[0]} y1={shape.center[1]} x2={radiusPoint[0]} y2={radiusPoint[1]} /><Handle point={radiusPoint} handle="radius" /></>;
  }
  if (shape.type === "polygon") return shape.points.map((point, index) => <Handle key={index} point={point} handle="vertex" index={index} />);
  const rect = rectFromCenter(shape.center, shape.size);
  const rotation = ((shape.rotationDegrees ?? 0) * Math.PI) / 180;
  const rotatePoint = (point: Point2): Point2 => {
    const dx = point[0] - shape.center[0];
    const dz = point[1] - shape.center[1];
    return [round(shape.center[0] + dx * Math.cos(rotation) - dz * Math.sin(rotation)), round(shape.center[1] + dx * Math.sin(rotation) + dz * Math.cos(rotation))];
  };
  const cornerPoints: Point2[] = [[rect.xMin, rect.zMin], [rect.xMax, rect.zMin], [rect.xMax, rect.zMax], [rect.xMin, rect.zMax]];
  const corners = cornerPoints.map(rotatePoint);
  const top = rotatePoint([shape.center[0], rect.zMin]);
  const rotate = rotatePoint([shape.center[0], rect.zMin - Math.max(0.8, Math.min(shape.size[0], shape.size[1]) * 0.25)]);
  return <><Handle point={shape.center} handle="center" anchor />{corners.map((point, index) => <Handle key={index} point={point} handle="corner" index={index} />)}<line className="edit-handle-guide" x1={top[0]} y1={top[1]} x2={rotate[0]} y2={rotate[1]} /><Handle point={rotate} handle="rotate" /></>;
}

function pathHandles(shape: PathShape) {
  if (shape.type === "line") return <><Handle point={shape.start} handle="start" /><Handle point={shape.end} handle="end" /></>;
  if (shape.type === "polyline") return shape.points.map((point, index) => <Handle key={index} point={point} handle="vertex" index={index} />);
  return <><Handle point={shape.start} handle="start" anchor />{shape.curves.flatMap((curve, curveIndex) => [<Handle key={`${curveIndex}-c1`} point={curve.c1} handle="bezier" index={curveIndex * 3} />, <Handle key={`${curveIndex}-c2`} point={curve.c2} handle="bezier" index={curveIndex * 3 + 1} />, <Handle key={`${curveIndex}-end`} point={curve.end} handle="bezier" index={curveIndex * 3 + 2} anchor />])}</>;
}

function Handle({ point, handle, index, anchor = false }: { point: Point2; handle: string; index?: number; anchor?: boolean }) {
  return <g className="edit-handle-node" data-handle={handle} data-handle-index={index}><circle className="edit-handle-hit" cx={point[0]} cy={point[1]} r={anchor ? 0.42 : 0.36} /><circle className={`edit-handle ${anchor ? "anchor" : ""}`} cx={point[0]} cy={point[1]} r={anchor ? 0.2 : 0.16} /></g>;
}
