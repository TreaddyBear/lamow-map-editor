import { Fence as FenceIcon, Mountain, MousePointer2, Plus, Route, Square, Waypoints } from "lucide-react";
import { areaBlueprints } from "../domain/blueprints";
import type { CanvasTool } from "../domain/model";
import { ActionRow, Button, Menu, MenuItem, MenuLabel, MenuSeparator } from "./ui";

type Props = {
  activeTool: CanvasTool;
  pinnedAreaBlueprintKeys: string[];
  onTool: (tool: CanvasTool) => void;
  onAdd: (kind: "area" | "road" | "dirtPath" | "fence" | "hill") => void;
  onAddBlueprintAtOrigin: (key: string) => void;
};

export function ViewportToolbar({ activeTool, pinnedAreaBlueprintKeys, onTool, onAdd, onAddBlueprintAtOrigin }: Props) {
  const pinned = pinnedAreaBlueprintKeys.map((key) => areaBlueprints.find((item) => item.key === key)).filter((item): item is (typeof areaBlueprints)[number] => Boolean(item));
  return (
    <div className="viewport-toolbar">
      <ActionRow>
        <Button className="icon-button" tone={activeTool === "select" ? "primary" : "default"} type="button" title="Select" onClick={() => onTool("select")}><MousePointer2 /></Button>
        <Menu trigger={<Button className="icon-button" type="button" title="Add"><Plus /></Button>}>
          <MenuItem onSelect={() => onAdd("area")}><span className="menu-item-icon"><Square />Lawn area</span></MenuItem>
          <MenuItem onSelect={() => onAdd("hill")}><span className="menu-item-icon"><Mountain />Hill</span></MenuItem>
          <MenuItem onSelect={() => onAdd("road")}><span className="menu-item-icon"><Route />Road</span></MenuItem>
          <MenuItem onSelect={() => onAdd("dirtPath")}><span className="menu-item-icon"><Waypoints />Dirt path</span></MenuItem>
          <MenuItem onSelect={() => onAdd("fence")}><span className="menu-item-icon"><FenceIcon />Fence</span></MenuItem>
          {pinned.length > 0 ? <MenuSeparator /> : null}
          {pinned.length > 0 ? <MenuLabel>Pinned blueprints</MenuLabel> : null}
          {pinned.map((blueprint) => <MenuItem key={blueprint.key} onSelect={() => onAddBlueprintAtOrigin(blueprint.key)}>{blueprint.label}</MenuItem>)}
        </Menu>
        <Button className="icon-button" tone={activeTool === "area" ? "primary" : "default"} type="button" title="Add areas by clicking" onClick={() => onTool("area")}><Square /></Button>
        <Button className="icon-button" tone={activeTool === "fence" ? "primary" : "default"} type="button" title="Draw fence" onClick={() => onTool("fence")}><FenceIcon /></Button>
        <Button className="icon-button" tone={activeTool === "road" ? "primary" : "default"} type="button" title="Draw road" onClick={() => onTool("road")}><Route /></Button>
        <Button className="icon-button" tone={activeTool === "dirtPath" ? "primary" : "default"} type="button" title="Draw dirt path" onClick={() => onTool("dirtPath")}><Waypoints /></Button>
        <Button className="icon-button" tone={activeTool === "hill" ? "primary" : "default"} type="button" title="Add hills by clicking" onClick={() => onTool("hill")}><Mountain /></Button>
      </ActionRow>
    </div>
  );
}
