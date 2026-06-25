import { rectFromCenter } from "../../domain/geometry";
import type { Area, AreaShape, HeightFeature, PathShape, Selection } from "../../domain/model";
import { sameSelection } from "../../editor/utils";
import { selectAttrs } from "./svgHelpers";

export function AreaSvg({ area, path, selection }: { area: Area; path: number[]; selection: Selection }) {
  const selected = sameSelection(selection, { kind: "area", path });
  const select = selectAttrs({ kind: "area", path });
  const fill = area.role === "bed" || area.surface === "dirt" ? "var(--map-dirt-fill)" : area.composition === "additive" ? "var(--map-additive-fill)" : area.role === "background" ? "var(--map-background-fill)" : "var(--map-lawn-fill)";
  const stroke = selected ? "var(--map-selection)" : area.role === "bed" || area.surface === "dirt" ? "var(--map-dirt-stroke)" : area.composition === "additive" ? "var(--map-additive-stroke)" : "var(--map-lawn-stroke)";
  return (
    <g {...select} className="map-object">
      <ShapeSvg shape={area.shape} attrs={{ ...select, className: selected ? "selected-object" : "", fill, opacity: area.composition === "additive" ? 0.42 : area.role === "background" ? 0.24 : 0.68, stroke, strokeWidth: selected ? 0.08 : 0.06 }} />
      {(area.children ?? []).map((child, index) => <AreaSvg key={`${child.id}-${index}`} area={child} path={[...path, index]} selection={selection} />)}
    </g>
  );
}

export function HillSvg({ hill, index, selection }: { hill: HeightFeature; index: number; selection: Selection }) {
  const selected = sameSelection(selection, { kind: "heightFeature", index });
  return <ShapeSvg shape={hill.shape} attrs={{ ...selectAttrs({ kind: "heightFeature", index }), className: `map-object ${selected ? "selected-object" : ""}`, fill: "var(--map-hill-fill)", opacity: 0.42, stroke: selected ? "var(--map-selection)" : "var(--map-hill-stroke)", strokeWidth: selected ? 0.08 : 0.06, strokeDasharray: "0.4 0.25" }} />;
}

export function PathSvg({ shape, item, selection, color, width, className }: { shape: PathShape; item: Selection; selection: Selection; color: string; width: number; className: string }) {
  const selected = sameSelection(selection, item);
  const attrs = { ...selectAttrs(item), className: `map-object ${className} ${selected ? "selected-object" : ""}`, fill: "none", stroke: selected ? "var(--map-selection)" : color, strokeWidth: selected ? Math.max(width, 0.08) : width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (shape.type === "line") return <line {...attrs} x1={shape.start[0]} y1={shape.start[1]} x2={shape.end[0]} y2={shape.end[1]} />;
  if (shape.type === "polyline") return <polyline {...attrs} points={shape.points.map((point) => `${point[0]},${point[1]}`).join(" ")} />;
  return <path {...attrs} d={`M ${shape.start[0]} ${shape.start[1]} ${shape.curves.map((curve) => `C ${curve.c1[0]} ${curve.c1[1]}, ${curve.c2[0]} ${curve.c2[1]}, ${curve.end[0]} ${curve.end[1]}`).join(" ")}`} />;
}

function ShapeSvg({ shape, attrs }: { shape: AreaShape; attrs: React.SVGProps<SVGElement> }) {
  if (shape.type === "circle") return <circle {...attrs as React.SVGProps<SVGCircleElement>} cx={shape.center[0]} cy={shape.center[1]} r={shape.radius} />;
  if (shape.type === "polygon") return <polygon {...attrs as React.SVGProps<SVGPolygonElement>} points={shape.points.map((point) => `${point[0]},${point[1]}`).join(" ")} />;
  const rect = rectFromCenter(shape.center, shape.size);
  return <rect {...attrs as React.SVGProps<SVGRectElement>} x={rect.xMin} y={rect.zMin} width={rect.xMax - rect.xMin} height={rect.zMax - rect.zMin} transform={shape.rotationDegrees ? `rotate(${shape.rotationDegrees} ${shape.center[0]} ${shape.center[1]})` : undefined} />;
}
