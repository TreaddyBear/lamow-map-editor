import { Fence as FenceIcon, Mountain, MousePointer2, Plus, Redo2, Route, Square, Undo2, Waypoints } from "lucide-react";
import { allBlueprintOptions } from "../utilities/domain/blueprints";
import type { CanvasTool, EditorBlueprint } from "../utilities/domain/model";
import { ActionRow, Button, Menu, MenuItem, MenuLabel, MenuSeparator } from "../Components/Base";

type Props = {
  activeTool: CanvasTool;
  pinnedAreaBlueprintKeys: string[];
  customBlueprints: EditorBlueprint[];
  canUndo: boolean;
  canRedo: boolean;
  onTool: (tool: CanvasTool) => void;
  onAdd: (kind: "area" | "road" | "dirtPath" | "fence" | "hill") => void;
  onAddBlueprintAtOrigin: (key: string) => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function ViewportToolbar({ activeTool, pinnedAreaBlueprintKeys, customBlueprints, canUndo, canRedo, onTool, onAdd, onAddBlueprintAtOrigin, onUndo, onRedo }: Props) {
  const pinned = pinnedAreaBlueprintKeys.map((key) => allBlueprintOptions(customBlueprints).find((item) => item.key === key)).filter((item): item is ReturnType<typeof allBlueprintOptions>[number] => Boolean(item));
  const itemIconClass = "grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:stroke-[2.2]";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--surface-border)] px-3 py-2">
      <ActionRow className="items-center">
        <Button size="icon" tone={activeTool === "select" ? "primary" : "default"} type="button" title="Select" onClick={() => onTool("select")}><MousePointer2 /></Button>
        <Menu trigger={<Button size="icon" type="button" title="Add"><Plus /></Button>}>
          <MenuItem onSelect={() => onAdd("area")}><span className={itemIconClass}><Square />Lawn area</span></MenuItem>
          <MenuItem onSelect={() => onAdd("hill")}><span className={itemIconClass}><Mountain />Hill</span></MenuItem>
          <MenuItem onSelect={() => onAdd("road")}><span className={itemIconClass}><Route />Road</span></MenuItem>
          <MenuItem onSelect={() => onAdd("dirtPath")}><span className={itemIconClass}><Waypoints />Dirt path</span></MenuItem>
          <MenuItem onSelect={() => onAdd("fence")}><span className={itemIconClass}><FenceIcon />Fence</span></MenuItem>
          {pinned.length > 0 ? <MenuSeparator /> : null}
          {pinned.length > 0 ? <MenuLabel>Pinned blueprints</MenuLabel> : null}
          {pinned.map((blueprint) => <MenuItem key={blueprint.key} onSelect={() => onAddBlueprintAtOrigin(blueprint.key)}>{blueprint.label}</MenuItem>)}
        </Menu>
        <Button size="icon" tone={activeTool === "area" ? "primary" : "default"} type="button" title="Add areas by clicking" onClick={() => onTool("area")}><Square /></Button>
        <Button size="icon" tone={activeTool === "fence" ? "primary" : "default"} type="button" title="Draw fence" onClick={() => onTool("fence")}><FenceIcon /></Button>
        <Button size="icon" tone={activeTool === "road" ? "primary" : "default"} type="button" title="Draw road" onClick={() => onTool("road")}><Route /></Button>
        <Button size="icon" tone={activeTool === "dirtPath" ? "primary" : "default"} type="button" title="Draw dirt path" onClick={() => onTool("dirtPath")}><Waypoints /></Button>
        <Button size="icon" tone={activeTool === "hill" ? "primary" : "default"} type="button" title="Add hills by clicking" onClick={() => onTool("hill")}><Mountain /></Button>
      </ActionRow>
      <ActionRow className="items-center">
        <Button size="icon" type="button" disabled={!canUndo} title="Undo" onClick={onUndo}><Undo2 /></Button>
        <Button size="icon" type="button" disabled={!canRedo} title="Redo" onClick={onRedo}><Redo2 /></Button>
      </ActionRow>
    </div>
  );
}
