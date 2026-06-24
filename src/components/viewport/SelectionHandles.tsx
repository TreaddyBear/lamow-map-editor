import type { Point2, LevelV1, Selection } from "../../domain/model";
import { selectionHandlePrimitives, type HandlePrimitive } from "./handlePrimitives";

export function SelectionHandles({ level, selection }: { level: LevelV1; selection: Selection }) {
  const primitives = selectionHandlePrimitives(level, selection);
  if (primitives.length === 0) return null;
  return <g className="edit-handles">{primitives.map((primitive, index) => <HandlePrimitiveSvg key={index} primitive={primitive} />)}</g>;
}

function Handle({ point, handle, index, anchor = false }: { point: Point2; handle: string; index?: number; anchor?: boolean }) {
  return <g className="edit-handle-node" data-handle={handle} data-handle-index={index}><circle className="edit-handle-hit" cx={point[0]} cy={point[1]} r={anchor ? 0.42 : 0.36} /><circle className={`edit-handle ${anchor ? "anchor" : ""}`} cx={point[0]} cy={point[1]} r={anchor ? 0.2 : 0.16} /></g>;
}

function HandlePrimitiveSvg({ primitive }: { primitive: HandlePrimitive }) {
  if (primitive.kind === "guide") return <line className="edit-handle-guide" x1={primitive.start[0]} y1={primitive.start[1]} x2={primitive.end[0]} y2={primitive.end[1]} />;
  return <Handle point={primitive.point} handle={primitive.handle} index={primitive.index} anchor={primitive.anchor} />;
}
