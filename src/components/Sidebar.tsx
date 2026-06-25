import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { Area, LevelV1, Selection } from "../domain/model";
import type { SidebarPanes } from "../editor/types";
import { pointLabel, sameSelection } from "../editor/utils";

type Props = {
  level: LevelV1;
  selection: Selection;
  panes: SidebarPanes;
  onPaneToggle: (name: keyof SidebarPanes, open: boolean) => void;
  onSelect: (selection: Selection) => void;
  onDelete: (selection: Selection) => void;
  onAdd: (kind: "level" | "area" | "road" | "dirtPath" | "fence" | "hill") => void;
  inspector: React.ReactNode;
};

export function Sidebar({ level, selection, panes, onPaneToggle, onSelect, onDelete, onAdd, inspector }: Props) {
  return (
    <div className="editor-sidebar">
      <details className="sidebar-pane" open={panes.tree} onToggle={(event) => onPaneToggle("tree", event.currentTarget.open)}>
        <summary>Map</summary>
        <div className="tree-pane">
          <div className="level-row">
            <label>Level</label>
            <div>{level.name} ({level.code})</div>
            <button className="tree-action" type="button" title="Add level" onClick={() => onAdd("level")}><Plus /></button>
          </div>
          <div className="tree">
            <TreeButton item={{ kind: "level" }} active={sameSelection(selection, { kind: "level" })} icon="L" label={`${level.name} / ${level.code}`} onSelect={onSelect} />
            <TreeButton item={{ kind: "spawn" }} active={sameSelection(selection, { kind: "spawn" })} icon="S" label={`spawn (${pointLabel(level.spawn.position)})`} onSelect={onSelect} />
            <TreeFolder label="areas" onAdd={() => onAdd("area")} />
            {level.areas.map((area, index) => <AreaTree key={`${area.id}-${index}`} area={area} path={[index]} depth={2} selection={selection} onSelect={onSelect} onDelete={onDelete} />)}
            <TreeFolder label="roads" onAdd={() => onAdd("road")} />
            {level.roads.map((road, index) => <TreeButton key={road.id} item={{ kind: "road", index }} active={sameSelection(selection, { kind: "road", index })} icon="R" label={`${road.id} (${road.width}m)`} onSelect={onSelect} onDelete={onDelete} />)}
            <TreeFolder label="dirt paths" onAdd={() => onAdd("dirtPath")} />
            {level.dirtPaths.map((path, index) => <TreeButton key={path.id} item={{ kind: "dirtPath", index }} active={sameSelection(selection, { kind: "dirtPath", index })} icon="P" label={`${path.id} (${path.width}m)`} onSelect={onSelect} onDelete={onDelete} />)}
            <TreeFolder label="fences" onAdd={() => onAdd("fence")} />
            {level.fences.map((fence, index) => <TreeButton key={fence.id} item={{ kind: "fence", index }} active={sameSelection(selection, { kind: "fence", index })} icon="F" label={`${fence.id} (${fence.height}m)`} onSelect={onSelect} onDelete={onDelete} />)}
            <TreeFolder label="terrain" onAdd={() => onAdd("hill")} />
            {level.terrain.heightFeatures.map((hill, index) => <TreeButton key={hill.id} item={{ kind: "heightFeature", index }} active={sameSelection(selection, { kind: "heightFeature", index })} icon="H" label={`${hill.id} (${hill.height}m)`} onSelect={onSelect} onDelete={onDelete} />)}
            <TreeButton item={{ kind: "objects" }} active={sameSelection(selection, { kind: "objects" })} icon="O" label={`objects (${level.objects.length})`} onSelect={onSelect} />
          </div>
        </div>
      </details>
      <details className="sidebar-pane" open={panes.inspector} onToggle={(event) => onPaneToggle("inspector", event.currentTarget.open)}>
        <summary>Inspector</summary>
        <div className="inspector-pane">{inspector}</div>
      </details>
    </div>
  );
}

function TreeFolder({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="tree-folder">
      <ChevronDown />
      <span>{label}</span>
      <button className="tree-action" type="button" title={`Add ${label}`} onClick={onAdd}><Plus /></button>
    </div>
  );
}

function TreeButton({ item, active, icon, label, onSelect, onDelete, depth = 1 }: { item: Selection; active: boolean; icon: string; label: string; onSelect: (selection: Selection) => void; onDelete?: (selection: Selection) => void; depth?: number }) {
  const depthClass = `tree-depth-${Math.min(depth, 8)}`;
  return (
    <div className={`tree-row ${depthClass} ${active ? "active" : ""}`}>
      <button className="tree-item" type="button" onClick={() => onSelect(item)}>
        <span className="tree-icon">{icon}</span>
        <span>{label}</span>
      </button>
      {onDelete ? <button className="tree-action tree-delete danger" type="button" title="Delete" onClick={() => onDelete(item)}><Trash2 /></button> : null}
    </div>
  );
}

function AreaTree({ area, path, depth, selection, onSelect, onDelete }: { area: Area; path: number[]; depth: number; selection: Selection; onSelect: (selection: Selection) => void; onDelete: (selection: Selection) => void }) {
  const item: Selection = { kind: "area", path };
  return (
    <>
      <TreeButton item={item} active={sameSelection(selection, item)} icon="A" label={`${area.id}${area.role ? ` ${area.role}` : ""} (${area.shape.type})`} depth={depth} onSelect={onSelect} onDelete={onDelete} />
      {area.vegetation.map((layer, index) => {
        const vegetation: Selection = { kind: "vegetation", path, vegetationIndex: index };
        return <TreeButton key={`${layer.id}-${index}`} item={vegetation} active={sameSelection(selection, vegetation)} icon="V" label={`${layer.id}: ${layer.type}`} depth={depth + 1} onSelect={onSelect} onDelete={onDelete} />;
      })}
      {(area.children ?? []).map((child, index) => <AreaTree key={`${child.id}-${index}`} area={child} path={[...path, index]} depth={depth + 1} selection={selection} onSelect={onSelect} onDelete={onDelete} />)}
    </>
  );
}
