import { rectFromCenter } from "../../domain/geometry";
import type { AreaShape, LevelV1, PathShape, Point2, Selection } from "../../domain/model";
import { getAreaByPath, round } from "../../editor/utils";

export function SelectionHandles({ level, selection }: { level: LevelV1; selection: Selection }) {
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
