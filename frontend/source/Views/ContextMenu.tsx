import { useEffect, useRef, type ReactNode } from "react";
import { allBlueprintOptions } from "../utilities/domain/blueprints";
import type { ContextMenuState, EditorBlueprint, Selection } from "../utilities/domain/model";
import { cn } from "../Components/Base";
import { menuContentClass, menuItemClass, menuLabelClass, menuSeparatorClass } from "../Components/Base/Menu";

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
    <div ref={ref} id="context-menu" className={cn(menuContentClass, "fixed")} style={{ left: menu.screenX, top: menu.screenY }}>
      {menu.target ? <ContextMenuButton onClick={() => onSelect(menu.target!)}>Select target</ContextMenuButton> : null}
      {menu.target ? <ContextMenuButton onClick={() => onDuplicate(menu.target!)}>Duplicate target</ContextMenuButton> : null}
      {menu.target ? <ContextMenuButton tone="danger" onClick={() => onDelete(menu.target!)}>Delete target</ContextMenuButton> : null}
      {menu.target ? <div className={menuSeparatorClass} /> : null}
      <ContextMenuButton onClick={onMoveSpawn}>Move spawn to crosshair</ContextMenuButton>
      <div className="group relative">
        <ContextMenuButton className="w-full after:float-right after:content-['>']">Add</ContextMenuButton>
        <div className={cn(menuContentClass, "absolute left-[calc(100%+0.35rem)] top-[-0.35rem] hidden max-h-[min(28rem,calc(100vh-2rem))] min-w-56 overflow-auto group-focus-within:grid group-hover:grid")}>
          <ContextMenuButton onClick={onAddArea}>Lawn area here</ContextMenuButton>
          <ContextMenuButton onClick={onAddChildArea}>Child area here</ContextMenuButton>
          {pinned.length > 0 ? <div className={menuLabelClass}>Pinned</div> : null}
          {pinned.map((blueprint) => <ContextMenuButton key={`pinned-${blueprint.key}`} onClick={() => onAddBlueprint(blueprint.key)}>{blueprint.label}</ContextMenuButton>)}
          {pinned.length > 0 ? <div className={menuLabelClass}>All blueprints</div> : null}
          {blueprints.map((blueprint) => <ContextMenuButton key={blueprint.key} onClick={() => onAddBlueprint(blueprint.key)}>{blueprint.label}</ContextMenuButton>)}
          <ContextMenuButton onClick={onStartFence}>Start fence at crosshair</ContextMenuButton>
          <ContextMenuButton onClick={onAddRoad}>Short road here</ContextMenuButton>
          <ContextMenuButton onClick={onAddDirtPath}>Short dirt path here</ContextMenuButton>
          <ContextMenuButton onClick={onAddHill}>Hill here</ContextMenuButton>
        </div>
      </div>
    </div>
  );
}

function ContextMenuButton({ children, className = "", tone = "default", onClick }: { children: ReactNode; className?: string; tone?: "default" | "danger"; onClick?: () => void }) {
  return (
    <button className={cn(menuItemClass, "border-0 bg-transparent text-left hover:bg-[var(--subtle-bg)]", tone === "danger" && "text-[#9b2424]", className)} type="button" onClick={onClick}>
      {children}
    </button>
  );
}
