import { areaBlueprints } from "../domain/blueprints";
import type { ContextMenuState, Selection } from "../domain/model";
import { Button } from "./ui";

export function ContextMenu({ menu, pinnedAreaBlueprintKeys, onClose: _onClose, onSelect, onDuplicate, onDelete, onMoveSpawn, onAddArea, onAddChildArea, onAddBlueprint, onStartFence, onAddRoad, onAddDirtPath, onAddHill }: {
  menu: ContextMenuState;
  pinnedAreaBlueprintKeys: string[];
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onDuplicate: (selection: Selection) => void;
  onDelete: (selection: Selection) => void;
  onMoveSpawn: () => void;
  onAddArea: () => void;
  onAddChildArea: () => void;
  onAddBlueprint: (key: string) => void;
  onStartFence: () => void;
  onAddRoad: () => void;
  onAddDirtPath: () => void;
  onAddHill: () => void;
}) {
  if (!menu) return null;
  const pinned = pinnedAreaBlueprintKeys.map((key) => areaBlueprints.find((item) => item.key === key)).filter((item): item is (typeof areaBlueprints)[number] => Boolean(item));
  return (
    <div id="context-menu" className="context-menu" style={{ left: menu.screenX, top: menu.screenY }}>
      {menu.target ? <Button type="button" onClick={() => onSelect(menu.target!)}>Select target</Button> : null}
      {menu.target ? <Button type="button" onClick={() => onDuplicate(menu.target!)}>Duplicate target</Button> : null}
      {menu.target ? <Button tone="danger" type="button" onClick={() => onDelete(menu.target!)}>Delete target</Button> : null}
      {menu.target ? <div className="context-divider" /> : null}
      <Button type="button" onClick={onMoveSpawn}>Move spawn to crosshair</Button>
      <details className="context-submenu" open>
        <summary>Add</summary>
        <Button type="button" onClick={onAddArea}>Lawn area here</Button>
        <Button type="button" onClick={onAddChildArea}>Child area here</Button>
        {pinned.length > 0 ? <div className="context-label">Pinned</div> : null}
        {pinned.map((blueprint) => <Button key={`pinned-${blueprint.key}`} type="button" onClick={() => onAddBlueprint(blueprint.key)}>{blueprint.label}</Button>)}
        {pinned.length > 0 ? <div className="context-label">All blueprints</div> : null}
        {areaBlueprints.map((blueprint) => <Button key={blueprint.key} type="button" onClick={() => onAddBlueprint(blueprint.key)}>{blueprint.label}</Button>)}
        <Button type="button" onClick={onStartFence}>Start fence at crosshair</Button>
        <Button type="button" onClick={onAddRoad}>Short road here</Button>
        <Button type="button" onClick={onAddDirtPath}>Short dirt path here</Button>
        <Button type="button" onClick={onAddHill}>Hill here</Button>
      </details>
    </div>
  );
}
