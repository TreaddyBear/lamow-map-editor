import { defaultPerlinDistribution, foliageRegistry, type Area, type AreaShape, type AuthoredItem, type DirtPath, type Distribution, type Fence, type FoliageType, type HeightFeature, type LevelV1, type PathShape, type Road, type Selection } from "../domain/model";
import { normalizeDistribution, normalizePoint2 } from "../domain/normalization";
import { shapeBounds, pathPoints } from "../domain/geometry";
import { appendCurve, appendPoint, getAreaByPath, numberValue, parseDistributionOctaves, parsePoints, parseTags, pointsText, tagsText, updateArray } from "../editor/utils";
import { Field, Point2Fields, Section, SelectField, TextAreaField } from "./formControls";

type Props = {
  level: LevelV1;
  selection: Selection;
  onUpdateLevel: (updater: (level: LevelV1) => LevelV1) => void;
  onUpdateArea: (path: number[], updater: (area: Area) => Area) => void;
  onDeleteSelection: () => void;
};

export function Inspector({ level, selection, onUpdateLevel, onUpdateArea, onDeleteSelection }: Props) {
  if (selection.kind === "level") {
    return (
      <Section title="Level">
        <Field label="Code" value={level.code} onCommit={(value) => onUpdateLevel((current) => ({ ...current, code: value }))} />
        <Field label="Name" value={level.name} onCommit={(value) => onUpdateLevel((current) => ({ ...current, name: value }))} />
        <Field label="Par seconds" type="number" value={level.parSeconds} onCommit={(value) => onUpdateLevel((current) => ({ ...current, parSeconds: numberValue(value, current.parSeconds) }))} />
        <Field label="Tags" value={tagsText(level.tags)} onCommit={(value) => onUpdateLevel((current) => ({ ...current, tags: parseTags(value) }))} />
      </Section>
    );
  }
  if (selection.kind === "spawn") {
    return (
      <Section title="Spawn">
        <Point2Fields label="position" point={level.spawn.position} onChange={(position) => onUpdateLevel((current) => ({ ...current, spawn: { ...current.spawn, position } }))} />
        <Field label="heading degrees" type="number" value={level.spawn.headingDegrees} onCommit={(value) => onUpdateLevel((current) => ({ ...current, spawn: { ...current.spawn, headingDegrees: numberValue(value, current.spawn.headingDegrees) } }))} />
      </Section>
    );
  }
  if (selection.kind === "area" && selection.path) {
    const area = getAreaByPath(level.areas, selection.path);
    if (!area) return <Empty />;
    return (
      <Section title={`Area ${area.id}`} action={<button className="danger" type="button" onClick={onDeleteSelection}>Delete</button>}>
        <AuthoredFields item={area} onChange={(next) => onUpdateArea(selection.path!, (current) => ({ ...current, ...next }))} />
        <SelectField label="composition" value={area.composition ?? "replace"} options={[{ value: "replace", label: "replace" }, { value: "additive", label: "additive" }]} onChange={(value) => onUpdateArea(selection.path!, (current) => ({ ...current, composition: value as Area["composition"] }))} />
        <SelectField label="role" value={area.role ?? ""} options={[{ value: "", label: "none" }, { value: "background", label: "background" }, { value: "lawn", label: "lawn" }, { value: "bed", label: "bed" }]} onChange={(value) => onUpdateArea(selection.path!, (current) => ({ ...current, role: (value || undefined) as Area["role"] }))} />
        <ShapeFields shape={area.shape} onChange={(shape) => onUpdateArea(selection.path!, (current) => ({ ...current, shape }))} />
      </Section>
    );
  }
  if (selection.kind === "vegetation" && selection.path && selection.vegetationIndex !== undefined) {
    const area = getAreaByPath(level.areas, selection.path);
    const layer = area?.vegetation[selection.vegetationIndex];
    if (!area || !layer) return <Empty />;
    return (
      <Section title={`Vegetation ${layer.id}`} action={<button className="danger" type="button" onClick={onDeleteSelection}>Delete</button>}>
        <Field label="id" value={layer.id} onCommit={(value) => onUpdateArea(selection.path!, (current) => ({ ...current, vegetation: updateArray(current.vegetation, selection.vegetationIndex!, { ...layer, id: value }) }))} />
        <SelectField label="type" value={layer.type} options={foliageRegistry.map((entry) => ({ value: entry.key, label: `${entry.label} (${entry.category})` }))} onChange={(value) => onUpdateArea(selection.path!, (current) => ({ ...current, vegetation: updateArray(current.vegetation, selection.vegetationIndex!, { ...layer, type: value as FoliageType }) }))} />
        <DistributionFields distribution={layer.distribution} onChange={(distribution) => onUpdateArea(selection.path!, (current) => ({ ...current, vegetation: updateArray(current.vegetation, selection.vegetationIndex!, { ...layer, distribution }) }))} />
      </Section>
    );
  }
  if (selection.kind === "road" && selection.index !== undefined && level.roads[selection.index]) return <PathItem title="Road" item={level.roads[selection.index]} onDelete={onDeleteSelection} onChange={(item) => onUpdateLevel((current) => ({ ...current, roads: updateArray(current.roads, selection.index!, item as Road) }))} />;
  if (selection.kind === "dirtPath" && selection.index !== undefined && level.dirtPaths[selection.index]) return <PathItem title="Dirt path" item={level.dirtPaths[selection.index]} onDelete={onDeleteSelection} onChange={(item) => onUpdateLevel((current) => ({ ...current, dirtPaths: updateArray(current.dirtPaths, selection.index!, item as DirtPath) }))} />;
  if (selection.kind === "fence" && selection.index !== undefined && level.fences[selection.index]) {
    const fence = level.fences[selection.index];
    return (
      <Section title={`Fence ${fence.id}`} action={<button className="danger" type="button" onClick={onDeleteSelection}>Delete</button>}>
        <AuthoredFields item={fence} onChange={(next) => onUpdateLevel((current) => ({ ...current, fences: updateArray(current.fences, selection.index!, { ...fence, ...next }) }))} />
        <Field label="height" type="number" value={fence.height} onCommit={(value) => onUpdateLevel((current) => ({ ...current, fences: updateArray(current.fences, selection.index!, { ...fence, height: numberValue(value, fence.height) }) }))} />
        <PathShapeFields shape={fence.shape} onChange={(shape) => onUpdateLevel((current) => ({ ...current, fences: updateArray(current.fences, selection.index!, { ...fence, shape }) }))} />
      </Section>
    );
  }
  if (selection.kind === "heightFeature" && selection.index !== undefined && level.terrain.heightFeatures[selection.index]) {
    const hill = level.terrain.heightFeatures[selection.index];
    return (
      <Section title={`Hill ${hill.id}`} action={<button className="danger" type="button" onClick={onDeleteSelection}>Delete</button>}>
        <AuthoredFields item={hill} onChange={(next) => onUpdateLevel((current) => ({ ...current, terrain: { heightFeatures: updateArray(current.terrain.heightFeatures, selection.index!, { ...hill, ...next }) } }))} />
        <Field label="height" type="number" value={hill.height} onCommit={(value) => onUpdateLevel((current) => ({ ...current, terrain: { heightFeatures: updateArray(current.terrain.heightFeatures, selection.index!, { ...hill, height: numberValue(value, hill.height) }) } }))} />
        <ShapeFields shape={hill.shape} onChange={(shape) => onUpdateLevel((current) => ({ ...current, terrain: { heightFeatures: updateArray(current.terrain.heightFeatures, selection.index!, { ...hill, shape }) } }))} />
      </Section>
    );
  }
  if (selection.kind === "objects") {
    return <Section title="Objects"><TextAreaField label="objects JSON" value={JSON.stringify(level.objects, null, 2)} onCommit={(value) => onUpdateLevel((current) => ({ ...current, objects: parseObjects(value, current.objects) }))} /></Section>;
  }
  return <Empty />;
}

function Empty() {
  return <div className="section"><div className="hint">Select an object to edit its properties.</div></div>;
}

function AuthoredFields({ item, onChange }: { item: AuthoredItem; onChange: (item: AuthoredItem) => void }) {
  return (
    <>
      <Field label="id" value={item.id} onCommit={(id) => onChange({ ...item, id })} />
      <Field label="name" value={item.name ?? ""} onCommit={(value) => onChange({ ...item, name: value.trim() || undefined })} />
      <Field label="tags" value={tagsText(item.tags)} onCommit={(value) => onChange({ ...item, tags: parseTags(value) })} />
    </>
  );
}

function ShapeFields({ shape, onChange }: { shape: AreaShape; onChange: (shape: AreaShape) => void }) {
  return (
    <>
      <SelectField label="shape" value={shape.type} options={[{ value: "rectangle", label: "rectangle" }, { value: "circle", label: "circle" }, { value: "polygon", label: "polygon" }]} onChange={(value) => onChange(convertAreaShape(shape, value as AreaShape["type"]))} />
      {shape.type === "circle" ? <><Point2Fields label="center" point={shape.center} onChange={(center) => onChange({ ...shape, center })} /><Field label="radius" type="number" value={shape.radius} onCommit={(value) => onChange({ ...shape, radius: numberValue(value, shape.radius) })} /></> : null}
      {shape.type === "rectangle" ? <><Point2Fields label="center" point={shape.center} onChange={(center) => onChange({ ...shape, center })} /><Point2Fields label="size" point={shape.size} onChange={(size) => onChange({ ...shape, size })} /><Field label="rotation degrees" type="number" value={shape.rotationDegrees ?? 0} onCommit={(value) => onChange({ ...shape, rotationDegrees: numberValue(value, shape.rotationDegrees ?? 0) })} /></> : null}
      {shape.type === "polygon" ? <><div className="json-actions"><button type="button" onClick={() => onChange({ ...shape, points: appendPoint(shape.points) })}>Add vertex</button><button className="danger" disabled={shape.points.length <= 3} type="button" onClick={() => onChange({ ...shape, points: shape.points.slice(0, -1) })}>Remove last</button></div><TextAreaField label="points" value={pointsText(shape.points)} onCommit={(value) => onChange({ ...shape, points: parsePoints(value, shape.points) })} /></> : null}
    </>
  );
}

function PathItem({ title, item, onChange, onDelete }: { title: string; item: Road | DirtPath; onChange: (item: Road | DirtPath) => void; onDelete: () => void }) {
  return (
    <Section title={`${title} ${item.id}`} action={<button className="danger" type="button" onClick={onDelete}>Delete</button>}>
      <AuthoredFields item={item} onChange={(next) => onChange({ ...item, ...next })} />
      <Field label="width" type="number" value={item.width} onCommit={(value) => onChange({ ...item, width: numberValue(value, item.width) })} />
      <PathShapeFields shape={item.shape} onChange={(shape) => onChange({ ...item, shape })} />
    </Section>
  );
}

function PathShapeFields({ shape, onChange }: { shape: PathShape; onChange: (shape: PathShape) => void }) {
  return (
    <>
      <SelectField label="shape" value={shape.type} options={[{ value: "line", label: "line" }, { value: "polyline", label: "polyline" }, { value: "cubicBezierPath", label: "cubicBezierPath" }]} onChange={(value) => onChange(convertPathShape(shape, value as PathShape["type"]))} />
      {shape.type === "line" ? <><Point2Fields label="start" point={shape.start} onChange={(start) => onChange({ ...shape, start })} /><Point2Fields label="end" point={shape.end} onChange={(end) => onChange({ ...shape, end })} /></> : null}
      {shape.type === "polyline" ? <><div className="json-actions"><button type="button" onClick={() => onChange({ ...shape, points: appendPoint(shape.points) })}>Add point</button><button className="danger" disabled={shape.points.length <= 2} type="button" onClick={() => onChange({ ...shape, points: shape.points.slice(0, -1) })}>Remove last</button></div><TextAreaField label="points" value={pointsText(shape.points)} onCommit={(value) => onChange({ ...shape, points: parsePoints(value, shape.points) })} /></> : null}
      {shape.type === "cubicBezierPath" ? <><Point2Fields label="start" point={shape.start} onChange={(start) => onChange({ ...shape, start })} /><div className="json-actions"><button type="button" onClick={() => onChange({ ...shape, curves: appendCurve(shape) })}>Add curve</button><button className="danger" disabled={shape.curves.length <= 1} type="button" onClick={() => onChange({ ...shape, curves: shape.curves.slice(0, -1) })}>Remove last</button></div><TextAreaField label="curves JSON" value={JSON.stringify(shape.curves)} onCommit={(value) => onChange({ ...shape, curves: parseCurves(value, shape.curves) })} /></> : null}
    </>
  );
}

function DistributionFields({ distribution, onChange }: { distribution: Distribution; onChange: (distribution: Distribution) => void }) {
  const type = distribution.type;
  return (
    <>
      <SelectField label="distribution" value={type} options={[{ value: "uniform", label: "uniform" }, { value: "perlin", label: "perlin" }]} onChange={(value) => onChange(value === "perlin" ? defaultPerlinDistribution(distribution.density, 1) : { type: "uniform", density: distribution.density })} />
      <Field label="density" type="number" value={distribution.density} onCommit={(value) => onChange(normalizeDistribution({ ...distribution, density: numberValue(value, distribution.density) }))} />
      {distribution.type === "perlin" ? <TextAreaField label="octaves JSON" value={JSON.stringify(distribution.noise.octaves)} onCommit={(value) => onChange({ ...distribution, noise: { ...distribution.noise, octaves: parseDistributionOctaves(value, distribution.noise.octaves) } })} /> : null}
    </>
  );
}

function convertAreaShape(shape: AreaShape, type: AreaShape["type"]): AreaShape {
  const bounds = shapeBounds(shape);
  const center = [Number(((bounds.xMin + bounds.xMax) / 2).toFixed(3)), Number(((bounds.zMin + bounds.zMax) / 2).toFixed(3))] as [number, number];
  const size = [Number((bounds.xMax - bounds.xMin).toFixed(3)), Number((bounds.zMax - bounds.zMin).toFixed(3))] as [number, number];
  if (type === "circle") return { type: "circle", center, radius: Math.max(size[0], size[1]) / 2 || 1 };
  if (type === "polygon") return { type: "polygon", points: [[bounds.xMin, bounds.zMin], [bounds.xMax, bounds.zMin], [bounds.xMax, bounds.zMax], [bounds.xMin, bounds.zMax]].map((point) => normalizePoint2(point, [0, 0])) };
  return { type: "rectangle", center, size };
}

function convertPathShape(shape: PathShape, type: PathShape["type"]): PathShape {
  const points = pathPoints(shape);
  const start = points[0] ?? [0, 0];
  const end = points.at(-1) ?? [2, 0];
  if (type === "polyline") return { type: "polyline", points: points.length >= 2 ? points : [start, end] };
  if (type === "cubicBezierPath") return { type: "cubicBezierPath", start, curves: [{ c1: start, c2: end, end }] };
  return { type: "line", start, end };
}

function parseCurves(value: string, fallback: { c1: [number, number]; c2: [number, number]; end: [number, number] }[]) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.map((curve) => ({ c1: normalizePoint2((curve as { c1?: unknown }).c1, [0, 0]), c2: normalizePoint2((curve as { c2?: unknown }).c2, [0, 0]), end: normalizePoint2((curve as { end?: unknown }).end, [0, 0]) }));
  } catch {
    return fallback;
  }
}

function parseObjects(value: string, fallback: unknown[]): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
