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
        <Menu trigger={<Button type="button">Add</Button>}>
          <MenuItem onSelect={() => onAdd("area")}>Lawn area</MenuItem>
          <MenuItem onSelect={() => onAdd("hill")}>Hill</MenuItem>
          <MenuItem onSelect={() => onAdd("road")}>Road</MenuItem>
          <MenuItem onSelect={() => onAdd("dirtPath")}>Dirt path</MenuItem>
          <MenuItem onSelect={() => onAdd("fence")}>Fence</MenuItem>
          {pinned.length > 0 ? <MenuSeparator /> : null}
          {pinned.length > 0 ? <MenuLabel>Pinned blueprints</MenuLabel> : null}
          {pinned.map((blueprint) => <MenuItem key={blueprint.key} onSelect={() => onAddBlueprintAtOrigin(blueprint.key)}>{blueprint.label}</MenuItem>)}
        </Menu>
        <Menu trigger={<Button type="button">Tools</Button>}>
          {(["select", "area", "fence", "road", "dirtPath", "hill"] as CanvasTool[]).map((tool) => <MenuItem key={tool} onSelect={() => onTool(tool)}>{toolLabel(tool)}{activeTool === tool ? " *" : ""}</MenuItem>)}
          <MenuSeparator />
          <MenuItem onSelect={() => onTool("spawn")}>Select spawn</MenuItem>
        </Menu>
      </ActionRow>
    </div>
  );
}

function toolLabel(tool: CanvasTool): string {
  if (tool === "dirtPath") return "Dirt path";
  return `${tool.charAt(0).toUpperCase()}${tool.slice(1)}`;
}
