import { useEffect, useRef } from "react";
import { allBlueprintOptions } from "../domain/blueprints";
import type { ContextMenuState, EditorBlueprint, Selection } from "../domain/model";
import { Button } from "./ui";

export function ContextMenu({ menu, pinnedAreaBlueprintKeys, customBlueprints, onClose, onSelect, onDuplicate, onDelete, onMoveSpawn, onAddArea, onAddChildArea, onAddBlueprint, onStartFence, onAddRoad, onAddDirtPath, onAddHill }: {
  menu: ContextMenuState;
  pinnedAreaBlueprintKeys: string[];
  customBlueprints: EditorBlueprint[];
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
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [menu, onClose]);

  if (!menu) return null;
  const blueprints = allBlueprintOptions(customBlueprints);
  const pinned = pinnedAreaBlueprintKeys.map((key) => blueprints.find((item) => item.key === key)).filter((item): item is (typeof blueprints)[number] => Boolean(item));
  return (
    <div ref={ref} id="context-menu" className="context-menu" style={{ left: menu.screenX, top: menu.screenY }}>
      {menu.target ? <Button type="button" onClick={() => onSelect(menu.target!)}>Select target</Button> : null}
      {menu.target ? <Button type="button" onClick={() => onDuplicate(menu.target!)}>Duplicate target</Button> : null}
      {menu.target ? <Button tone="danger" type="button" onClick={() => onDelete(menu.target!)}>Delete target</Button> : null}
      {menu.target ? <div className="context-divider" /> : null}
      <Button type="button" onClick={onMoveSpawn}>Move spawn to crosshair</Button>
      <div className="context-popout-row">
        <Button type="button">Add</Button>
        <div className="context-popout">
        <Button type="button" onClick={onAddArea}>Lawn area here</Button>
        <Button type="button" onClick={onAddChildArea}>Child area here</Button>
        {pinned.length > 0 ? <div className="context-label">Pinned</div> : null}
        {pinned.map((blueprint) => <Button key={`pinned-${blueprint.key}`} type="button" onClick={() => onAddBlueprint(blueprint.key)}>{blueprint.label}</Button>)}
        {pinned.length > 0 ? <div className="context-label">All blueprints</div> : null}
        {blueprints.map((blueprint) => <Button key={blueprint.key} type="button" onClick={() => onAddBlueprint(blueprint.key)}>{blueprint.label}</Button>)}
        <Button type="button" onClick={onStartFence}>Start fence at crosshair</Button>
        <Button type="button" onClick={onAddRoad}>Short road here</Button>
        <Button type="button" onClick={onAddDirtPath}>Short dirt path here</Button>
        <Button type="button" onClick={onAddHill}>Hill here</Button>
        </div>
      </div>
    </div>
  );
}
