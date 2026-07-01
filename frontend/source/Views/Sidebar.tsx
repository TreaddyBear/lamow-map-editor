import { ChevronDown, Plus, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { Area, LevelV1, Selection } from "../utilities/domain/model";
import type { SidebarPanes } from "../utilities/editor/types";
import { pointLabel, sameSelection } from "../utilities/editor/utils";
import { DisclosurePane, cn } from "../Components/Base";

type Props = {
  level: LevelV1;
  selection: Selection;
  panes: SidebarPanes;
  onPaneToggle: (name: keyof SidebarPanes, open: boolean) => void;
  onSelect: (selection: Selection) => void;
  onDelete: (selection: Selection) => void;
  onAdd: (kind: "level" | "area" | "road" | "dirtPath" | "fence" | "hill") => void;
  inspector: ReactNode;
};

export function Sidebar({ level, selection, panes, onPaneToggle, onSelect, onDelete, onAdd, inspector }: Props) {
  return (
    <div className="grid min-h-0 content-start overflow-auto">
      <DisclosurePane title="Map" open={panes.tree} onOpenChange={(open) => onPaneToggle("tree", open)}>
        <div className="min-h-0 overflow-auto p-2.5">
          <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <label className="text-xs font-extrabold text-[var(--app-text)]">Level</label>
            <div>{level.name} ({level.code})</div>
            <TreeAction title="Add level" onClick={() => onAdd("level")}><Plus /></TreeAction>
          </div>
          <div className="grid gap-px text-[0.74rem]">
            <TreeButton item={{ kind: "level" }} active={sameSelection(selection, { kind: "level" })} icon="L" label={`${level.name} / ${level.code}`} onSelect={onSelect} />
            <TreeButton item={{ kind: "spawn" }} active={sameSelection(selection, { kind: "spawn" })} icon="S" label={`spawn (${pointLabel(level.spawn.position)})`} onSelect={onSelect} />
            <TreeFolder label="areas" onAdd={() => onAdd("area")} />
            {level.areas.map((area, index) => <AreaTree key={`${area.id}-${index}`} area={area} path={[index]} depth={2} parentDepth={1} selection={selection} onSelect={onSelect} onDelete={onDelete} />)}
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
      </DisclosurePane>
      <DisclosurePane title="Inspector" open={panes.inspector} onOpenChange={(open) => onPaneToggle("inspector", open)}>
        <div className="min-h-0 overflow-auto p-2.5 [&_textarea]:min-h-24">{inspector}</div>
      </DisclosurePane>
    </div>
  );
}

function TreeFolder({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-1 px-1 pb-0.5 pt-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.02em] text-[var(--muted-text)] [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[2.4]">
      <ChevronDown />
      <span>{label}</span>
      <TreeAction title={`Add ${label}`} onClick={onAdd}><Plus /></TreeAction>
    </div>
  );
}

function TreeButton({ item, active, icon, label, onSelect, onDelete, depth = 1, parentDepth }: { item: Selection; active: boolean; icon: string; label: string; onSelect: (selection: Selection) => void; onDelete?: (selection: Selection) => void; depth?: number; parentDepth?: number }) {
  const style = treeDepthStyle(depth, parentDepth);
  return (
    <div className={cn(treeRowClass, parentDepth !== undefined && treeForkClass, active && "bg-[var(--subtle-bg)]")} style={style}>
      <button className={cn(treeItemClass, active && "border-[var(--map-lawn-stroke)] bg-[var(--subtle-bg)]")} type="button" onClick={() => onSelect(item)}>
        <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-[var(--surface-border)] bg-[var(--input-bg)] text-center text-[0.66rem] font-black text-[var(--muted-text)]">{icon}</span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
      </button>
      {onDelete ? <TreeAction className="relative z-[1] mr-0.5 text-[#9b2424] hover:border-[#e2b4b4] hover:bg-[#fff0ed]" title="Delete" onClick={() => onDelete(item)}><Trash2 /></TreeAction> : null}
    </div>
  );
}

function TreeAction({ children, className = "", title, onClick }: { children: ReactNode; className?: string; title: string; onClick: () => void }) {
  return (
    <button className={cn("inline-grid h-6 w-6 place-items-center border border-transparent bg-transparent p-0 leading-none [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[2.2]", className)} type="button" title={title} onClick={onClick}>
      {children}
    </button>
  );
}

const treeRowClass = "relative grid grid-cols-[minmax(0,1fr)_auto] items-center rounded before:pointer-events-none before:absolute before:bottom-[-1px] before:left-[var(--tree-line-offset)] before:top-[-1px] before:border-l before:border-[var(--surface-border)] before:content-[''] after:pointer-events-none after:absolute after:left-[var(--tree-line-offset)] after:top-1/2 after:w-[var(--tree-elbow-width)] after:border-t after:border-[var(--surface-border)] after:content-['']";
const treeForkClass = "after:left-[var(--tree-parent-line-offset)] after:w-[var(--tree-fork-width)]";
const treeItemClass = "relative z-[1] grid min-w-0 grid-cols-[1.35rem_minmax(0,1fr)] items-center gap-1 rounded border border-transparent bg-transparent py-1 pr-1 pl-[var(--tree-item-indent)] text-left font-medium";
const treeBranchClass = "relative before:pointer-events-none before:absolute before:bottom-3 before:left-[var(--tree-branch-line-offset)] before:top-[-0.15rem] before:border-l before:border-[var(--surface-border)] before:content-['']";
const treeBaseLineOffset = 1.32;
const treeDepthStep = 0.82;
const treeIconPadding = 0.6;
const treeElbowWidth = 0.44;

function treeDepthStyle(depth: number, parentDepth?: number): CSSProperties {
  const lineOffset = treeLineOffset(depth);
  const parentLineOffset = parentDepth === undefined ? lineOffset : treeLineOffset(parentDepth);

  return {
    "--tree-line-offset": `${lineOffset}rem`,
    "--tree-parent-line-offset": `${parentLineOffset}rem`,
    "--tree-fork-width": `${Math.max(lineOffset - parentLineOffset, treeElbowWidth)}rem`,
    "--tree-elbow-width": `${treeElbowWidth}rem`,
    "--tree-item-indent": `${lineOffset - treeIconPadding}rem`,
  } as CSSProperties;
}

function treeBranchStyle(depth: number): CSSProperties {
  return { "--tree-branch-line-offset": `${treeLineOffset(depth)}rem` } as CSSProperties;
}

function treeLineOffset(depth: number) {
  return treeBaseLineOffset + (Math.max(depth, 1) - 1) * treeDepthStep;
}

function AreaTree({ area, path, depth, parentDepth, selection, onSelect, onDelete }: { area: Area; path: number[]; depth: number; parentDepth: number; selection: Selection; onSelect: (selection: Selection) => void; onDelete: (selection: Selection) => void }) {
  const item: Selection = { kind: "area", path };
  const children = area.children ?? [];
  return (
    <>
      <TreeButton item={item} active={sameSelection(selection, item)} icon="A" label={`${area.id}${area.role ? ` ${area.role}` : ""} (${area.shape.type})`} depth={depth} parentDepth={parentDepth} onSelect={onSelect} onDelete={onDelete} />
      {area.vegetation.length || children.length ? (
        <div className={treeBranchClass} style={treeBranchStyle(depth)}>
          {area.vegetation.map((layer, index) => {
            const vegetation: Selection = { kind: "vegetation", path, vegetationIndex: index };
            return <TreeButton key={`${layer.id}-${index}`} item={vegetation} active={sameSelection(selection, vegetation)} icon="V" label={`${layer.id}: ${layer.type}`} depth={depth + 1} parentDepth={depth} onSelect={onSelect} onDelete={onDelete} />;
          })}
          {children.map((child, index) => <AreaTree key={`${child.id}-${index}`} area={child} path={[...path, index]} depth={depth + 1} parentDepth={depth} selection={selection} onSelect={onSelect} onDelete={onDelete} />)}
        </div>
      ) : null}
    </>
  );
}
